/**
 * Vite 开发服务器中间件：为浏览器预览提供真实的 SQLite 后端。
 *
 * 桌面运行时由 Rust 侧的 tauri-plugin-sql 执行 SQL；在没有桌面窗口的环境里，
 * 这里用 node:sqlite 打开工作区内一个真实的 data.db 文件，执行同一份
 * src-tauri/migrations/001_init.sql，并接受 /__dsh/sql 上的 { op, query, values }。
 *
 * 因此预览模式下界面发出的 SQL、参数绑定与 PRAGMA 与桌面端完全一致，只是执行者不同。
 * 该中间件只在 `pnpm dev` 生效，生产构建不包含它。
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 把 `$1, $2 ...` 占位符换成 node:sqlite 接受的位置参数。
 * 按出现顺序取值，因此同一个占位符重复出现也能正确绑定。
 */
function bindPlaceholders(query, values) {
  const ordered = [];
  const text = query.replace(/\$(\d+)/g, (_match, index) => {
    ordered.push(values[Number(index) - 1] ?? null);
    return '?';
  });
  return { text, ordered };
}

export function sqlPreviewPlugin({ root, dbFile }) {
  const resolvedDb = dbFile ?? path.join(root, '.scratch', 'preview', 'data.db');
  const migrationFile = path.join(root, 'src-tauri', 'migrations', '001_init.sql');

  let db = null;

  function open() {
    if (db) return db;
    mkdirSync(path.dirname(resolvedDb), { recursive: true });
    const fresh = !existsSync(resolvedDb);
    db = new DatabaseSync(resolvedDb);

    // 与应用一致：先切 WAL，再跑迁移。
    const mode = db.prepare('PRAGMA journal_mode = WAL;').get();
    db.exec('PRAGMA synchronous = NORMAL;');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(readFileSync(migrationFile, 'utf8'));

    console.log(
      `[sql-preview] ${fresh ? '新建' : '打开'} ${resolvedDb} (journal_mode=${mode?.journal_mode})`,
    );
    return db;
  }

  function handle(body) {
    const op = body?.op;
    const query = String(body?.query ?? '');
    const values = Array.isArray(body?.values) ? body.values : [];
    const { text, ordered } = bindPlaceholders(query, values);

    if (op === 'select') {
      return open().prepare(text).all(...ordered);
    }
    if (op === 'execute') {
      const result = open().prepare(text).run(...ordered);
      return {
        rowsAffected: Number(result.changes ?? 0),
        lastInsertId: Number(result.lastInsertRowid ?? 0),
      };
    }
    throw new Error(`未知操作: ${op}`);
  }

  return {
    name: 'dsh-sql-preview',
    apply: 'serve',
    configureServer(server) {
      open();
      server.middlewares.use('/__dsh/sql', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          res.setHeader('content-type', 'application/json; charset=utf-8');
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
            res.end(JSON.stringify(handle(body)));
          } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ message: String(error?.message ?? error) }));
          }
        });
      });
    },
  };
}

export { bindPlaceholders };
