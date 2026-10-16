/**
 * 用 Node 的 TLS 栈下载文件（受限进程的 Schannel 不可用，curl/rustup 都会失败）。
 *
 *   node tools/download-files.mjs <url1> <out1> [<url2> <out2> ...]
 */
import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';

const args = process.argv.slice(2);
if (args.length === 0 || args.length % 2 !== 0) {
  console.error('用法: node tools/download-files.mjs <url> <out> [<url> <out> ...]');
  process.exit(2);
}

/** 官方地址失败时依次尝试的镜像前缀。 */
const MIRRORS = [
  (url) => url,
  (url) => url.replace('https://github.com/', 'https://ghfast.top/https://github.com/'),
  (url) => url.replace('https://github.com/', 'https://gh-proxy.com/https://github.com/'),
];

for (let i = 0; i < args.length; i += 2) {
  const url = args[i];
  const out = path.resolve(args[i + 1]);

  try {
    const s = await stat(out);
    if (s.size > 1024) {
      console.log(`cached  ${path.basename(out)} (${(s.size / 1048576).toFixed(1)} MB)`);
      continue;
    }
  } catch {
    /* 需要下载 */
  }

  await mkdir(path.dirname(out), { recursive: true });

  let lastError;
  for (const rewrite of MIRRORS) {
    const target = rewrite(url);
    try {
      const res = await fetch(target, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      process.stdout.write(`get     ${path.basename(out)} <- ${target} ... `);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(out));
      const s = await stat(out);
      console.log(`${(s.size / 1048576).toFixed(1)} MB`);
      lastError = null;
      break;
    } catch (e) {
      console.log(`失败 (${e.message})`);
      lastError = e;
    }
  }

  if (lastError) {
    console.error(`下载失败: ${url}`);
    process.exit(1);
  }
}
