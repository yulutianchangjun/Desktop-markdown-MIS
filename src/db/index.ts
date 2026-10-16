/**
 * SQLite 访问层。
 *
 * 表结构与索引由 Rust 侧的 migration（src-tauri/migrations/001_init.sql）在连接建立时
 * 创建，这里只负责 PRAGMA 调优与增删改查。所有 SQL 都使用 `$1` 占位符绑定参数，
 * 不做字符串拼接。
 *
 * 数据库位置由 Rust 决定（程序同级 `data/data.db`）：这里先向 Rust 要连接串，再交给
 * plugin-sql。连接串必须与 Rust 注册 migration 时的键完全一致，否则 migration 不会执行。
 * 传 `autoCreate: false` 是因为文件已由 Rust 建好，同时也避免 plugin-sql 去创建
 * `%APPDATA%` 下的应用目录（这正是「只能以管理员启动」那个缺陷的根源）。
 *
 * 具体由谁执行这些 SQL 交给 transport 决定（桌面运行时 = plugin-sql；浏览器预览 =
 * 开发服务器上的 node:sqlite），本模块只关心语句本身。
 */
import { invoke } from '@tauri-apps/api/core';
import Database from '@tauri-apps/plugin-sql';
import {
  isTauriRuntime,
  PreviewTransport,
  TauriTransport,
  type SqlTransport,
} from './transport';

export interface DocumentRow {
  id: number;
  title: string;
  raw_content: string;
  category: string | null;
  tags: string | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentDraft {
  title: string;
  raw_content: string;
  category?: string;
  tags?: string | null;
}

export interface DocumentMetaPatch {
  title?: string;
  category?: string;
  tags?: string | null;
}

/** 浏览器预览模式下由开发服务器使用的库；桌面运行时位置由 Rust 决定。 */
export const PREVIEW_DB_HINT = '.scratch/preview/data.db';
export const DEFAULT_CATEGORY = '未分类';

let handle: Promise<SqlTransport> | null = null;

/** 单例连接：整个进程只打开一个连接池，避免 SQLite 多写者争用。 */
export function db(): Promise<SqlTransport> {
  handle ??= open();
  return handle;
}

async function open(): Promise<SqlTransport> {
  let transport: SqlTransport;

  if (isTauriRuntime()) {
    // 位置由 Rust 统一决定：程序同级 data/data.db（便携绿色版）。
    const connectionUrl = await invoke<string>('db_connection_url');
    const database = await Database.load(connectionUrl, { autoCreate: false });
    transport = new TauriTransport(database);
  } else if (import.meta.env.DEV) {
    // 浏览器内预览：真正的桌面运行不会走到这里，见 src/db/transport.ts。
    transport = new PreviewTransport();
  } else {
    throw new Error('未检测到 Tauri 运行时：本应用需要作为桌面程序启动。');
  }

  // WAL 模式：读不阻塞写、写不阻塞读；PRAGMA journal_mode 会返回一行，必须用 select。
  const mode = await transport.select<{ journal_mode: string }[]>('PRAGMA journal_mode = WAL;');
  if (mode[0]?.journal_mode?.toLowerCase() !== 'wal') {
    console.warn('[dms] 未能启用 WAL，当前 journal_mode =', mode[0]?.journal_mode);
  }
  await transport.execute('PRAGMA synchronous = NORMAL;');
  await transport.execute('PRAGMA foreign_keys = ON;');
  await transport.execute('PRAGMA busy_timeout = 5000;');

  return transport;
}

/** 供「系统设置」展示真实落盘位置与运行状态。 */
export async function journalMode(): Promise<string> {
  const rows = await (await db()).select<{ journal_mode: string }[]>('PRAGMA journal_mode;');
  return rows[0]?.journal_mode ?? 'unknown';
}

// --------------------------------------------------------------------------
// documents
// --------------------------------------------------------------------------

export async function fetchDocuments(includeArchived = true): Promise<DocumentRow[]> {
  const where = includeArchived ? '' : 'WHERE is_archived = 0';
  return (await db()).select<DocumentRow[]>(
    `SELECT * FROM documents ${where} ORDER BY datetime(updated_at) DESC, id DESC`,
  );
}

export async function insertDocument(draft: DocumentDraft): Promise<number> {
  const result = await (
    await db()
  ).execute(
    `INSERT INTO documents (title, raw_content, category, tags)
     VALUES ($1, $2, $3, $4)`,
    [
      draft.title,
      draft.raw_content,
      draft.category?.trim() || DEFAULT_CATEGORY,
      draft.tags?.trim() || null,
    ],
  );
  return Number(result.lastInsertId ?? 0);
}

/** Ctrl+S：只回写源码与修改时间，标题/分类不受影响。 */
export async function saveDocumentContent(id: number, rawContent: string): Promise<void> {
  await (
    await db()
  ).execute(
    `UPDATE documents
        SET raw_content = $1,
            updated_at  = datetime('now', 'localtime')
      WHERE id = $2`,
    [rawContent, id],
  );
}

export async function updateDocumentMeta(id: number, patch: DocumentMetaPatch): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (patch.title !== undefined) {
    values.push(patch.title);
    sets.push(`title = $${values.length}`);
  }
  if (patch.category !== undefined) {
    values.push(patch.category.trim() || DEFAULT_CATEGORY);
    sets.push(`category = $${values.length}`);
  }
  if (patch.tags !== undefined) {
    values.push(patch.tags?.trim() || null);
    sets.push(`tags = $${values.length}`);
  }
  if (!sets.length) return;

  values.push(id);
  await (
    await db()
  ).execute(
    `UPDATE documents
        SET ${sets.join(', ')},
            updated_at = datetime('now', 'localtime')
      WHERE id = $${values.length}`,
    values,
  );
}

export async function setDocumentArchived(id: number, archived: boolean): Promise<void> {
  await (
    await db()
  ).execute(
    `UPDATE documents
        SET is_archived = $1,
            updated_at  = datetime('now', 'localtime')
      WHERE id = $2`,
    [archived ? 1 : 0, id],
  );
}

export async function deleteDocument(id: number): Promise<void> {
  await (await db()).execute('DELETE FROM documents WHERE id = $1', [id]);
}

export async function countDocuments(): Promise<number> {
  const rows = await (
    await db()
  ).select<{ n: number }[]>('SELECT COUNT(*) AS n FROM documents');
  return Number(rows[0]?.n ?? 0);
}

// --------------------------------------------------------------------------
// user_settings
// --------------------------------------------------------------------------

export async function fetchSettings(): Promise<Record<string, string>> {
  const rows = await (
    await db()
  ).select<{ key: string; value: string }[]>('SELECT key, value FROM user_settings');
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

export async function saveSetting(key: string, value: string): Promise<void> {
  await (
    await db()
  ).execute(
    `INSERT INTO user_settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}
