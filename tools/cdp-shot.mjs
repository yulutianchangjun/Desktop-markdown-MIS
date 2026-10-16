/**
 * 通过 Chrome DevTools Protocol 驱动无头 Edge，逐屏截图。
 *
 * 不依赖 puppeteer：Node 内置的 WebSocket 就够用，省掉一个几百 MB 的依赖。
 * 用法：node tools/cdp-shot.mjs <appUrl> <outDir>
 *
 * 每一步都是一段在页面里执行的表达式（点击导航、打开文档、切换模式），
 * 之后等界面稳定再截图，因此截到的是真实交互后的界面。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const APP_URL = process.argv[2] ?? 'http://127.0.0.1:1420/';
const OUT_DIR = process.argv[3] ?? 'shots';
const CDP = process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9222';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 等待页面里出现选择器，最多等 timeout 毫秒。 */
async function waitFor(send, selector, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const { result } = await send('Runtime.evaluate', {
      expression: `!!document.querySelector(${JSON.stringify(selector)})`,
      returnByValue: true,
    });
    if (result?.value === true) return true;
    await sleep(250);
  }
  return false;
}

async function evaluate(send, expression) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (exceptionDetails) {
    throw new Error(`页面执行失败: ${exceptionDetails.text} ${exceptionDetails.exception?.description ?? ''}`);
  }
  return result?.value;
}

async function connect() {
  const res = await fetch(`${CDP}/json/list`);
  const targets = await res.json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('未找到可用的页面目标');

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

/** 每个场景：先执行 action（可为空），等 settle，再截图。 */
const SCENARIOS = [
  {
    file: '01-dashboard-dark.png',
    note: 'Bento 仪表盘（深色）',
    action: `document.querySelectorAll('.rail-item').length && window.__dmsGo ? 0 : 0`,
  },
  {
    file: '02-documents.png',
    note: '全部文档',
    action: `document.querySelectorAll('.rail-item')[0].click()`,
  },
  {
    file: '03-categories.png',
    note: '分类目录树',
    action: `document.querySelectorAll('.rail-item')[1].click()`,
  },
  {
    file: '04-timeline.png',
    note: '时间轴流',
    action: `document.querySelectorAll('.rail-item')[2].click()`,
  },
  {
    file: '05-trash.png',
    note: '废纸篓 / 归档',
    action: `document.querySelectorAll('.rail-item')[3].click()`,
  },
  {
    file: '06-settings.png',
    note: '系统设置',
    action: `document.querySelectorAll('.rail-item')[4].click()`,
  },
  {
    file: '07-editor-split.png',
    note: '编辑区 · 双模式',
    action: `(() => { document.querySelectorAll('.rail-item')[0].click(); window.__dmsDocRow && 0; })()`,
    then: `document.querySelector('.doc-row').click()`,
  },
  {
    file: '08-editor-preview.png',
    note: '编辑区 · 纯阅览模式',
    action: `document.querySelectorAll('.mode-btn')[0].click()`,
  },
  {
    file: '09-editor-source.png',
    note: '编辑区 · 纯源码模式',
    action: `document.querySelectorAll('.mode-btn')[2].click()`,
  },
  {
    file: '10-light-dashboard.png',
    note: '浅色模式 · 双模式编辑区',
    action: `document.querySelectorAll('.mode-btn')[1].click()`,
    then: `document.querySelector('.icon-btn[title^="切换"]').click()`,
  },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
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
  await sleep(1500);

  const ready = await waitFor(send, '.rail-item');
  console.log(`界面就绪: ${ready}`);
  await sleep(1200);

  const results = [];
  for (const scenario of SCENARIOS) {
    try {
      if (scenario.action) await evaluate(send, scenario.action);
      await sleep(500);
      if (scenario.then) await evaluate(send, scenario.then);
      await sleep(1400);

      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      const file = path.join(OUT_DIR, scenario.file);
      await writeFile(file, Buffer.from(data, 'base64'));
      results.push(`  OK   ${scenario.file}  — ${scenario.note}`);
    } catch (error) {
      results.push(`  FAIL ${scenario.file}  — ${scenario.note}: ${error.message}`);
    }
  }

  close();
  console.log(results.join('\n'));
}

await main();
