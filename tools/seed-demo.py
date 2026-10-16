"""向真实 data.db 写入演示数据，便于验证界面与查询。

用法：
    python tools/seed-demo.py --db <data.db>

写入的文档覆盖多级分类、跨月创建时间、标签、归档状态，用于同时验证：
仪表盘（最近编辑 / 当月时间轴 / 统计）、分类目录树、时间轴流、废纸篓。
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path

MIGRATION = Path(__file__).resolve().parent.parent / "src-tauri" / "migrations" / "001_init.sql"


def stamp(days_ago: int, hour: int = 10, minute: int = 24) -> str:
    day = datetime.now() - timedelta(days=days_ago)
    return day.replace(hour=hour, minute=minute, second=0, microsecond=0).strftime(
        "%Y-%m-%d %H:%M:%S"
    )


# (标题, 分类, 标签, 创建于N天前, 更新于N天前, 是否归档, 正文)
DOCS: list[tuple[str, str, str | None, int, int, int, str]] = [
    (
        "Tauri v2 桌面端打包笔记",
        "技术/桌面端",
        "tauri,rust,打包",
        96,
        0,
        0,
        """# Tauri v2 桌面端打包笔记

记录把前端工程封装成桌面应用时踩过的坑。

## 体积

单文件二进制约 **5.5 MB**，远小于 Electron 方案。关键在两点：

1. 复用系统 WebView2，不打包浏览器内核；
2. release profile 开启 `lto` + `opt-level = "s"` + `strip`。

```toml
[profile.release]
lto = true
opt-level = "s"
strip = true
```

## 无边框窗口

`decorations: false` 之后窗口控制要自己实现：

```ts
import { getCurrentWindow } from '@tauri-apps/api/window';
const appWindow = getCurrentWindow();
await appWindow.toggleMaximize();
```

> 记得给拖拽区域加上 `data-tauri-drag-region`，并放行
> `core:window:allow-start-dragging` 权限。
""",
    ),
    (
        "Vue 3 组合式 API 速查",
        "技术/前端",
        "vue,typescript",
        64,
        2,
        0,
        """# Vue 3 组合式 API 速查

## 响应式要点

| API | 适用场景 |
| --- | --- |
| `ref` | 基本类型、需要整体替换的对象 |
| `computed` | 派生状态，带缓存 |
| `watch` | 副作用，需要旧值 |

```ts
const rows = ref<Row[]>([]);
const total = computed(() => rows.value.length);

watch(total, (next, prev) => {
  console.log(`${prev} -> ${next}`);
});
```

在模板里 ref 会自动解包，但在 `computed` 的 getter 中必须写 `.value`。
""",
    ),
    (
        "Pinia 状态管理实践",
        "技术/前端",
        "pinia,状态管理",
        52,
        4,
        0,
        """# Pinia 状态管理实践

用 setup 语法定义 store，和组件写法保持一致：

```ts
export const useDocsStore = defineStore('documents', () => {
  const rows = ref<DocumentRow[]>([]);

  const recent = computed(() => rows.value.slice(0, 5));

  async function load() {
    rows.value = await fetchDocuments(true);
  }

  return { rows, recent, load };
});
```

要点：**状态、派生、动作**三段式组织；异步动作内部自己处理错误，
不要把异常抛给模板层。
""",
    ),
    (
        "SQLite WAL 模式与并发",
        "技术/存储",
        "sqlite,wal,并发",
        38,
        1,
        0,
        """# SQLite WAL 模式与并发

WAL（Write-Ahead Logging）把改动先追加到 `-wal` 文件，读事务不再被写事务阻塞。

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
```

注意 `PRAGMA journal_mode` **会返回一行结果**，所以不能用 `execute`，
要用 `select`：

```ts
const mode = await db.select<{ journal_mode: string }[]>('PRAGMA journal_mode = WAL;');
```

落盘后会同时看到这三个文件：

- `data.db`
- `data.db-wal`
- `data.db-shm`
""",
    ),
    (
        "Markdown 写作规范",
        "写作/规范",
        "markdown,规范",
        27,
        6,
        0,
        """# Markdown 写作规范

1. 一级标题只出现一次，与文件名保持一致；
2. 列表、代码块前后留空行；
3. 中英文之间加空格，标点遵循中文习惯；
4. 表格必须给表头分隔行。

```markdown
| 字段 | 含义 |
| --- | --- |
| title | 文档标题 |
```

> 规范的意义是减少 diff 噪声，而不是束缚表达。
""",
    ),
    (
        "本周复盘",
        "写作/随笔",
        None,
        5,
        5,
        0,
        """# 本周复盘

## 做完了

- 把文档管理流程从「散落在文件夹」收敛到单一应用
- 打通拖拽导入 → 落库 → 编辑 → 导出

## 待办

- [ ] 补全文搜索
- [ ] 分类支持拖拽调整层级
- [x] 归档 / 还原

## 一句话

工具的价值不在于功能多，而在于**用得下去**。
""",
    ),
    (
        "会议纪要 · 产品评审",
        "工作/会议",
        "会议,纪要",
        12,
        3,
        0,
        """# 会议纪要 · 产品评审

**时间**：上周四 14:00
**参与**：产品、前端、测试

## 结论

1. 首版聚焦「导入 / 编辑 / 检索」三条主链路，不做云同步；
2. 分类用 `/` 路径表达层级，不引入独立的分类表；
3. 删除一律先软删除，废纸篓保留还原入口。

## 待确认

- 导出是否需要保留原始文件名
- 深色是否为默认主题
""",
    ),
    (
        "阅读笔记：深入理解计算机系统",
        "阅读",
        "读书,csapp",
        44,
        9,
        0,
        """# 阅读笔记：深入理解计算机系统

## 第 6 章 存储器层次结构

局部性原理是整章的主线：时间局部性 + 空间局部性。

一个好的循环写法能让缓存命中率差出一个数量级：

```c
/* 按行遍历，空间局部性好 */
for (i = 0; i < N; i++)
    for (j = 0; j < N; j++)
        sum += a[i][j];
```

对照列遍历版本，性能差距随 N 增大迅速拉开。
""",
    ),
    (
        "废弃草稿 · 旧方案对比",
        "技术",
        "草稿",
        70,
        30,
        1,
        """# 废弃草稿 · 旧方案对比

早期考虑过把文档存成散落的 `.md` 文件 + 内存索引，
后来因为检索与事务性都不好维护而放弃，改为 SQLite 单文件存储。

留档备查。
""",
    ),
]


def main() -> int:
    parser = argparse.ArgumentParser(description="写入 Local DMS 演示数据")
    parser.add_argument("--db", type=Path, required=True, help="目标 data.db 路径")
    parser.add_argument("--force", action="store_true", help="即使已有文档也继续写入")
    args = parser.parse_args()

    db_file = args.db
    # 库不存在时直接建一个（先切 WAL 再建表），这样既能为预览模式准备数据库，
    # 也能给已经跑过 migration 的应用库补数据。
    db_file.parent.mkdir(parents=True, exist_ok=True)
    created = not db_file.exists()

    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    if created:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")

    # 确保结构存在（应用首次启动的 migration 已经建好，这里是幂等兜底）。
    conn.executescript(MIGRATION.read_text(encoding="utf-8"))

    existing = conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
    if existing and not args.force:
        print(f"已有 {existing} 篇文档，跳过（加 --force 可强制写入）")
        conn.close()
        return 0

    for title, category, tags, created_days, updated_days, archived, body in DOCS:
        conn.execute(
            """INSERT INTO documents
                   (title, raw_content, category, tags, is_archived, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                title,
                body,
                category,
                tags,
                archived,
                stamp(created_days, hour=9 + (created_days % 8)),
                stamp(updated_days, hour=11 + (updated_days % 9)),
            ),
        )

    conn.commit()
    total = conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
    archived_n = conn.execute(
        "SELECT COUNT(*) FROM documents WHERE is_archived = 1"
    ).fetchone()[0]
    cats = [r[0] for r in conn.execute("SELECT DISTINCT category FROM documents ORDER BY 1")]
    conn.close()

    print(f"已写入演示数据: {db_file}")
    print(f"  文档 {total} 篇（其中归档 {archived_n} 篇）")
    print(f"  分类: {', '.join(cats)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
