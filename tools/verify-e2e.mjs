/**
 * 端到端校验：用 CDP 驱动真实界面执行写操作，再直接读 SQLite 文件断言结果。
 *
 * 关键在于「谁写的」：界面里的增删改查全部走应用自己的代码路径
 * （stores → src/db/index.ts → transport），落到一个真实的 data.db 文件上。
 * 因此这个脚本验证的是「应用代码确实把改动写进了 SQLite」，而不是另写一份等价 SQL。
 *
 * 用法：
 *   1) pnpm dev                          （启动带 node:sqlite 后端的开发服务器）
 *   2) node tools/verify-e2e.mjs <appUrl> <dbPath>
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const APP_URL = process.argv[2] ?? 'http://127.0.0.1:1420/';
const DB_PATH = path.resolve(process.argv[3] ?? '.scratch/preview/data.db');
const CDP = process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9222';

const TARGET_TITLE = '本周复盘';
const NEW_CATEGORY = '测试/端到端';
const NEW_TAGS = 'e2e,校验';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

function check(name, ok, detail = '') {
  results.push({ ok: Boolean(ok), name, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? `  — ${detail}` : ''}`);
}

/** 每次断言都重新开一个只读连接，确保读到的是真正落盘的内容。 */
function read(fn) {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

const row = (title) =>
  read((db) =>
    db
      .prepare(
        'SELECT id, title, category, tags, is_archived, created_at, updated_at FROM documents WHERE title = ?',
      )
      .get(title),
  );

async function connect() {
  const targets = await (await fetch(`${CDP}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('未找到页面目标');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  return { send, close: () => ws.close() };
}

async function evaluate(send, expression) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  }
  return result?.value;
}

async function main() {
  const { send, close } = await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1360,
    height: 880,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url: APP_URL });
  await sleep(2500);

  // ---- 0. 环境与基线 ----
  const journal = read((db) => db.prepare('PRAGMA journal_mode').get().journal_mode);
  check('数据库以 WAL 模式打开', journal?.toLowerCase() === 'wal', String(journal));

  const baseline = row(TARGET_TITLE);
  check(`基线文档存在：${TARGET_TITLE}`, Boolean(baseline), JSON.stringify(baseline));
  if (!baseline) throw new Error('缺少基线文档，先跑 tools/seed-demo.py');

  // ---- 1. 进入「全部文档」并打开目标文档 ----
  await evaluate(send, `document.querySelectorAll('.rail-item')[0].click()`);
  await sleep(1200);
  const opened = await evaluate(
    send,
    `(() => {
       const target = ${JSON.stringify(TARGET_TITLE)};
       const rowEl = [...document.querySelectorAll('.doc-row')]
         .find((r) => r.querySelector('.doc-title')?.textContent.trim() === target);
       if (!rowEl) return 'row-not-found';
       rowEl.click();
       return 'clicked';
     })()`,
  );
  await sleep(1200);
  const inEditor = await evaluate(send, `!!document.querySelector('.title-input')`);
  check('点击列表项进入编辑区', opened === 'clicked' && inEditor === true, `clicked=${opened}`);

  // ---- 2. 改分类（应用代码 → UPDATE documents.category）----
  await evaluate(
    send,
    `(() => {
       const el = document.querySelectorAll('.meta-input')[0];
       el.value = ${JSON.stringify(NEW_CATEGORY)};
       el.dispatchEvent(new Event('change', { bubbles: true }));
     })()`,
  );
  await sleep(1500);
  const afterCategory = row(TARGET_TITLE);
  check(
    '修改分类写回 SQLite',
    afterCategory?.category === NEW_CATEGORY,
    `category=${afterCategory?.category}`,
  );

  // ---- 3. 改标签 ----
  await evaluate(
    send,
    `(() => {
       const el = document.querySelectorAll('.meta-input')[1];
       el.value = ${JSON.stringify(NEW_TAGS)};
       el.dispatchEvent(new Event('change', { bubbles: true }));
     })()`,
  );
  await sleep(1500);
  const afterTags = row(TARGET_TITLE);
  check('修改标签写回 SQLite', afterTags?.tags === NEW_TAGS, `tags=${afterTags?.tags}`);

  // ---- 4. 改标题 ----
  const renamed = `${TARGET_TITLE}（已改名）`;
  await evaluate(
    send,
    `(() => {
       const el = document.querySelector('.title-input');
       el.value = ${JSON.stringify(renamed)};
       el.dispatchEvent(new Event('change', { bubbles: true }));
     })()`,
  );
  await sleep(1500);
  const afterRename = row(renamed);
  check('修改标题写回 SQLite', Boolean(afterRename), `row=${afterRename ? 'found' : 'missing'}`);

  // ---- 5. 保存（Ctrl+S 路径：UPDATE raw_content + updated_at）----
  await evaluate(send, `document.querySelector('.op-actions .ghost-btn.is-primary').click()`);
  await sleep(1800);
  const afterSave = row(renamed);
  check(
    '保存刷新 updated_at',
    Boolean(afterSave) && afterSave.updated_at !== afterRename.updated_at,
    `${afterRename?.updated_at} -> ${afterSave?.updated_at}`,
  );
  check(
    '保存不改动 created_at',
    afterSave?.created_at === afterRename?.created_at,
    `${afterSave?.created_at}`,
  );

  // ---- 6. 归档（软删除）----
  await evaluate(send, `document.querySelector('.op-actions .ghost-btn:last-child').click()`);
  await sleep(1800);
  const afterArchive = row(renamed);
  check('归档写入 is_archived = 1', afterArchive?.is_archived === 1, `is_archived=${afterArchive?.is_archived}`);
  check(
    '归档是软删除，记录仍在表中',
    read((db) => db.prepare('SELECT COUNT(*) AS n FROM documents').get().n) >= 9,
    `总行数 ${read((db) => db.prepare('SELECT COUNT(*) AS n FROM documents').get().n)}`,
  );

  // ---- 7. 废纸篓还原 ----
  await evaluate(send, `document.querySelectorAll('.rail-item')[3].click()`);
  await sleep(1200);
  const restored = await evaluate(
    send,
    `(() => {
       const target = ${JSON.stringify(renamed)};
       const rowEl = [...document.querySelectorAll('.doc-row')]
         .find((r) => r.querySelector('.doc-title')?.textContent.trim() === target);
       if (!rowEl) return 'row-not-found';
       rowEl.querySelector('.doc-actions .mini-btn').click();
       return 'clicked';
     })()`,
  );
  await sleep(1800);
  const afterRestore = row(renamed);
  check(
    '废纸篓还原写入 is_archived = 0',
    restored === 'clicked' && afterRestore?.is_archived === 0,
    `is_archived=${afterRestore?.is_archived}`,
  );

  // ---- 8. 主题切换（user_settings UPSERT）----
  const themeBefore = read(
    (db) => db.prepare("SELECT value FROM user_settings WHERE key = 'active_theme'").get()?.value,
  );
  await evaluate(send, `document.querySelector('.icon-btn[title^="切换"]').click()`);
  await sleep(1800);
  const themeAfter = read(
    (db) => db.prepare("SELECT value FROM user_settings WHERE key = 'active_theme'").get()?.value,
  );
  check(
    '主题切换写入 user_settings',
    Boolean(themeAfter) && themeAfter !== themeBefore,
    `active_theme: ${themeBefore} -> ${themeAfter}`,
  );

  // ---- 9. WAL 文件确实存在 ----
  const walOk = await import('node:fs').then((fs) => fs.existsSync(`${DB_PATH}-wal`));
  check('WAL 日志文件存在', walOk, `${DB_PATH}-wal`);

  // ---- 还原演示数据，保持库干净 ----
  const db = new DatabaseSync(DB_PATH);
  db.prepare(
    'UPDATE documents SET title = ?, category = ?, tags = ?, is_archived = 0 WHERE id = ?',
  ).run(TARGET_TITLE, '写作/随笔', null, baseline.id);
  db.close();

  close();

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n共 ${results.length} 项断言，失败 ${failed} 项。数据库：${DB_PATH}`);
  process.exit(failed ? 1 : 0);
}

await main();
