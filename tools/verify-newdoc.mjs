/**
 * 「快速新建文档」工作流的端到端校验。
 *
 * 用 CDP 驱动真实界面：点导航轨的 + → 断言库里出现草稿 → 在正文写 `# 一级标题`
 * → 保存 → 断言标题被正文的一级标题改写、分类仍是 `未命名`。
 *
 * 用法：
 *   1) pnpm dev
 *   2) node tools/verify-newdoc.mjs <appUrl> <dbPath>
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const APP_URL = process.argv[2] ?? 'http://127.0.0.1:1420/';
const DB_PATH = path.resolve(process.argv[3] ?? '.scratch/preview/data.db');
const CDP = process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9222';
const SHOT_DIR = '.scratch/shots';

const AUTO_TITLE = /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}未命名文件$/;
const H1_TEXT = '我的新建标题';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

function check(name, ok, detail = '') {
  results.push({ ok: Boolean(ok), name, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? `  — ${detail}` : ''}`);
}

function query(sql, params = []) {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  try {
    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
}

const latest = () =>
  query(
    'SELECT id, title, category, raw_content FROM documents ORDER BY id DESC LIMIT 1',
  )[0];

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

async function shot(send, name) {
  await mkdir(SHOT_DIR, { recursive: true });
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(SHOT_DIR, name), Buffer.from(data, 'base64'));
  console.log(`  截图 ${path.join(SHOT_DIR, name)}`);
}

async function waitFor(send, selector, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const ok = await evaluate(send, `!!document.querySelector(${JSON.stringify(selector)})`);
    if (ok) return true;
    await sleep(200);
  }
  return false;
}

async function main() {
  const before = query('SELECT COUNT(*) AS n FROM documents')[0].n;

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

  // ---- 1. 导航轨上能看到品牌 Logo 与「新建」入口 ----
  check('导航轨存在品牌区 Logo', await evaluate(send, `!!document.querySelector('.brand .brand-logo')`));
  const createReady = await waitFor(send, '.rail-item.create');
  check('导航轨存在「+ 新建文档」按钮', createReady);
  const titleAttr = await evaluate(
    send,
    `document.querySelector('.rail-item.create')?.getAttribute('title')`,
  );
  check('新建按钮带 title 提示', titleAttr === '新建文档', String(titleAttr));
  await shot(send, '11-rail-with-logo.png');

  // ---- 2. 点击 + 后直接进入编辑器 ----
  await evaluate(send, `document.querySelector('.rail-item.create').click()`);
  const editorReady = await waitFor(send, '.editor-host');
  await sleep(1200);
  check('点击 + 直接进入编辑器（无弹窗）', editorReady);

  const created = latest();
  check(
    '新建文档写入数据库',
    query('SELECT COUNT(*) AS n FROM documents')[0].n === before + 1,
    `行数 ${before} -> ${query('SELECT COUNT(*) AS n FROM documents')[0].n}`,
  );
  check('默认分类为「未命名」', created?.category === '未命名', String(created?.category));
  check(
    '初始标题为时间戳兜底格式',
    AUTO_TITLE.test(created?.title ?? ''),
    String(created?.title),
  );
  check('正文初始为空', (created?.raw_content ?? '') === '');

  // ---- 3. 在正文写一级标题并保存 ----
  const focused = await evaluate(send, `document.activeElement?.classList.contains('cm-content')`);
  check('新建后正文已获得输入焦点', focused === true, String(focused));

  await send('Input.insertText', { text: `# ${H1_TEXT}\n\n这是一段正文。\n` });
  await sleep(600);
  await shot(send, '12-new-draft-editor.png');

  await evaluate(send, `document.querySelector('.op-actions .ghost-btn.is-primary').click()`);
  await sleep(1800);

  const saved = latest();
  check(
    '保存后标题被一级标题改写',
    saved?.title === H1_TEXT,
    `${created?.title} -> ${saved?.title}`,
  );
  check('分类仍为「未命名」', saved?.category === '未命名', String(saved?.category));
  check('正文已落库', (saved?.raw_content ?? '').includes(H1_TEXT));
  await shot(send, '13-after-save.png');

  // ---- 4. 收尾：删掉本次校验产生的草稿，保持演示库干净 ----
  const db = new DatabaseSync(DB_PATH);
  db.prepare('DELETE FROM documents WHERE id = ?').run(created.id);
  db.close();
  check('校验数据已清理', latest()?.title !== H1_TEXT);

  close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n共 ${results.length} 项断言，失败 ${failed} 项。数据库：${DB_PATH}`);
  process.exit(failed ? 1 : 0);
}

await main();
