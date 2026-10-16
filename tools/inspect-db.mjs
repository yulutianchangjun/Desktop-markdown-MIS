// 检查某个 data.db 的内容概览（只读）。
//   node tools/inspect-db.mjs <path>
import { DatabaseSync } from 'node:sqlite';

const file = process.argv[2];
if (!file) {
  console.error('用法: node tools/inspect-db.mjs <data.db>');
  process.exit(2);
}

const db = new DatabaseSync(file, { readOnly: true });
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all()
  .map((r) => r.name);
const indexes = db
  .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((r) => r.name);

console.log(`文件: ${file}`);
console.log(`journal_mode: ${db.prepare('PRAGMA journal_mode').get().journal_mode}`);
console.log(`表: ${tables.join(', ')}`);
console.log(`索引: ${indexes.join(', ')}`);

if (tables.includes('documents')) {
  const total = db.prepare('SELECT COUNT(*) AS n FROM documents').get().n;
  const archived = db.prepare('SELECT COUNT(*) AS n FROM documents WHERE is_archived = 1').get().n;
  console.log(`文档: ${total} 篇（归档 ${archived} 篇）`);
  const titles = db
    .prepare('SELECT title FROM documents ORDER BY datetime(updated_at) DESC LIMIT 12')
    .all()
    .map((r) => r.title);
  console.log(`最近标题: ${titles.join(' | ') || '（空）'}`);
}

if (tables.includes('user_settings')) {
  const settings = db.prepare('SELECT key, value FROM user_settings ORDER BY key').all();
  console.log(`配置: ${settings.map((r) => `${r.key}=${r.value}`).join(', ') || '（空）'}`);
}

if (tables.includes('_sqlx_migrations')) {
  const rows = db.prepare('SELECT version, description, success FROM _sqlx_migrations ORDER BY version').all();
  console.log(`migration: ${rows.map((r) => `v${r.version} ${r.description} success=${r.success}`).join('; ')}`);
}

db.close();
