"""真实 SQLite 校验：结构、WAL、CRUD 往返与索引可用性。

用法：
    python tools/verify-db.py --scratch                 # 在临时库上跑完整 CRUD 套件
    python tools/verify-db.py --db <data.db>            # 校验应用真实落盘的库（只读）

脚本直接执行 src-tauri/migrations/001_init.sql，与应用启动时 Rust 侧 migration 用的是
同一份 SQL 文件，因此这里验证的结构与真实运行结构一致。
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATION = ROOT / "src-tauri" / "migrations" / "001_init.sql"

PASS = "PASS"
FAIL = "FAIL"
results: list[tuple[str, str, str]] = []


def check(name: str, ok: bool, detail: str = "") -> bool:
    results.append((PASS if ok else FAIL, name, detail))
    return ok


def apply_migration(conn: sqlite3.Connection) -> None:
    conn.executescript(MIGRATION.read_text(encoding="utf-8"))


def schema_report(conn: sqlite3.Connection, label: str) -> None:
    tables = {
        r[0]
        for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    check(f"[{label}] documents 表存在", "documents" in tables, ", ".join(sorted(tables)))
    check(f"[{label}] user_settings 表存在", "user_settings" in tables)

    indexes = {
        r[0]
        for r in conn.execute("SELECT name FROM sqlite_master WHERE type='index'")
    }
    check(f"[{label}] idx_docs_created 索引存在", "idx_docs_created" in indexes,
          ", ".join(sorted(i for i in indexes if i)))
    check(f"[{label}] idx_docs_category 索引存在", "idx_docs_category" in indexes)

    doc_cols = {r[1]: r for r in conn.execute("PRAGMA table_info(documents)")}
    expected = {
        "id", "title", "raw_content", "category", "tags",
        "is_archived", "created_at", "updated_at",
    }
    check(f"[{label}] documents 字段完整", expected <= set(doc_cols),
          f"实际: {', '.join(doc_cols)}")

    # 规范要求 category 默认 '未分类'、is_archived 默认 0。
    check(f"[{label}] category 默认值为「未分类」",
          "未分类" in (doc_cols["category"][4] or ""), str(doc_cols["category"][4]))
    check(f"[{label}] is_archived 默认值为 0",
          (doc_cols["is_archived"][4] or "") == "0", str(doc_cols["is_archived"][4]))

    mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
    check(f"[{label}] journal_mode = WAL", mode.lower() == "wal", mode)


def explain(conn: sqlite3.Connection, sql: str, args: tuple = ()) -> str:
    rows = conn.execute(f"EXPLAIN QUERY PLAN {sql}", args).fetchall()
    return " | ".join(str(r[3]) for r in rows)


def crud_suite(conn: sqlite3.Connection) -> None:
    label = "scratch"

    # ---- INSERT：不显式写时间戳，交给列默认值 ----
    cur = conn.execute(
        "INSERT INTO documents (title, raw_content, category, tags) VALUES (?, ?, ?, ?)",
        ("导入测试", "# 标题\n\n正文内容\n```python\nprint(1)\n```", "技术/前端/Vue", "vue,markdown"),
    )
    doc_id = cur.lastrowid
    row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    check(f"[{label}] INSERT 返回自增 id", doc_id == 1, str(doc_id))
    check(f"[{label}] raw_content 长文本原样落库",
          row["raw_content"].startswith("# 标题") and "```python" in row["raw_content"])
    check(f"[{label}] created_at/updated_at 自动填充",
          bool(row["created_at"]) and bool(row["updated_at"]),
          f"{row['created_at']} / {row['updated_at']}")
    check(f"[{label}] is_archived 默认 0", row["is_archived"] == 0)

    # ---- UPDATE：Ctrl+S 的保存路径 ----
    conn.execute(
        "UPDATE documents SET raw_content = ?, updated_at = datetime('now','localtime') WHERE id = ?",
        ("# 标题\n\n正文内容（已修改）", doc_id),
    )
    row = conn.execute("SELECT raw_content, updated_at FROM documents WHERE id = ?", (doc_id,)).fetchone()
    check(f"[{label}] UPDATE 回写 raw_content", "已修改" in row["raw_content"])

    # ---- 软删除 / 还原 ----
    conn.execute("UPDATE documents SET is_archived = 1 WHERE id = ?", (doc_id,))
    check(f"[{label}] 软删除后 is_archived = 1",
          conn.execute("SELECT is_archived FROM documents WHERE id = ?", (doc_id,)).fetchone()[0] == 1)
    check(f"[{label}] 软删除不减少总行数",
          conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0] == 1)
    check(f"[{label}] 归档筛选可命中",
          conn.execute("SELECT COUNT(*) FROM documents WHERE is_archived = 0").fetchone()[0] == 0)

    conn.execute("UPDATE documents SET is_archived = 0 WHERE id = ?", (doc_id,))
    check(f"[{label}] 还原后 is_archived = 0",
          conn.execute("SELECT is_archived FROM documents WHERE id = ?", (doc_id,)).fetchone()[0] == 0)

    # ---- user_settings 的 UPSERT ----
    for key, value in (("active_theme", "dark"), ("view_mode", "split"), ("active_theme", "light")):
        conn.execute(
            "INSERT INTO user_settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
    settings = dict(conn.execute("SELECT key, value FROM user_settings"))
    check(f"[{label}] user_settings 主键 UPSERT 覆盖旧值",
          settings.get("active_theme") == "light", str(settings))
    check(f"[{label}] user_settings 保留多个键", len(settings) == 2, str(sorted(settings)))

    # ---- 索引可用性 ----
    plan_created = explain(conn, "SELECT * FROM documents ORDER BY created_at DESC")
    plan_category = explain(conn, "SELECT * FROM documents WHERE category = ?", ("技术/前端/Vue",))
    check(f"[{label}] 时间轴排序可走 idx_docs_created",
          "idx_docs_created" in plan_created, plan_created)
    check(f"[{label}] 分类筛选可走 idx_docs_category",
          "idx_docs_category" in plan_category, plan_category)

    # ---- DELETE ----
    conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    check(f"[{label}] DELETE 彻底移除记录",
          conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0] == 0)


def run_scratch() -> None:
    # 临时库放在工作区内：DSH 沙箱下系统临时目录不可写，且这里能保证 SQLite 正常创建
    # data.db / -wal / -shm 三个文件。
    scratch_dir = ROOT / ".scratch"
    scratch_dir.mkdir(exist_ok=True)
    db_file = scratch_dir / "verify.db"
    for stale in scratch_dir.glob("verify.db*"):
        stale.unlink(missing_ok=True)

    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row

    # 与应用一致：连接后先切 WAL，再执行迁移。
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    apply_migration(conn)

    schema_report(conn, "scratch")
    crud_suite(conn)

    wal = db_file.with_name(db_file.name + "-wal")
    check("[scratch] WAL 日志文件已生成", wal.exists(), str(wal))
    conn.close()


def run_against(db_file: Path) -> None:
    if not db_file.exists():
        check(f"数据库文件存在: {db_file}", False, "文件不存在")
        return
    check(f"数据库文件存在: {db_file}", True, f"{db_file.stat().st_size} bytes")

    uri = f"file:{db_file.as_posix()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    schema_report(conn, "app")

    total = conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
    archived = conn.execute("SELECT COUNT(*) FROM documents WHERE is_archived = 1").fetchone()[0]
    categories = [
        r[0] for r in conn.execute("SELECT DISTINCT category FROM documents ORDER BY category")
    ]
    results.append((PASS, "documents 行数", f"{total} 行（归档 {archived}）"))
    results.append((PASS, "分类分布", ", ".join(categories) or "（空）"))

    for name, sql in (
        ("按更新时间倒序", "SELECT * FROM documents ORDER BY datetime(updated_at) DESC, id DESC"),
        ("按分类检索", "SELECT * FROM documents WHERE category = '未分类'"),
    ):
        results.append((PASS, f"查询计划 · {name}", explain(conn, sql)))

    conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="校验 Local DMS 的 SQLite 结构与行为")
    parser.add_argument("--db", type=Path, help="校验已存在的 data.db（只读）")
    parser.add_argument("--scratch", action="store_true", help="在临时库上跑完整 CRUD 套件")
    args = parser.parse_args()

    if not args.db and not args.scratch:
        parser.error("至少指定 --scratch 或 --db <path>")

    if args.scratch:
        run_scratch()
    if args.db:
        run_against(args.db)

    width = max(len(n) for _, n, _ in results)
    failed = 0
    for status, name, detail in results:
        if status == FAIL:
            failed += 1
        suffix = f"  — {detail}" if detail else ""
        print(f"[{status}] {name.ljust(width)}{suffix}")

    print()
    print(f"共 {len(results)} 项，失败 {failed} 项。迁移文件：{MIGRATION}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
