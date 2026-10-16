// Fetches Rust dist artifacts over Node's TLS stack (works under the DSH sandbox).
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name, def = null) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : def;
};
const OUT = flag('--out', '.');

const MIRRORS = [
  'https://static.rust-lang.org/dist',
  'https://mirrors.tuna.tsinghua.edu.cn/rustup/dist',
  'https://mirrors.ustc.edu.cn/rust-static/dist',
];

async function fetchWithFallback(rel) {
  let lastErr;
  for (const base of MIRRORS) {
    try {
      const res = await fetch(`${base}/${rel}`);
      if (res.ok) return res;
      lastErr = new Error(`HTTP ${res.status} for ${base}/${rel}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error(`unreachable: ${rel}`);
}

if (args.includes('--resolve')) {
  const res = await fetchWithFallback('channel-rust-stable.toml');
  const toml = await res.text();
  const idx = toml.indexOf('[pkg.rust]');
  if (idx < 0) throw new Error('no [pkg.rust] in channel manifest');
  // The manifest carries "1.99.0 (b940084d7 2026-09-28)"; dist file names use only the semver.
  const m = toml.slice(idx).match(/^version\s*=\s*"(\d+\.\d+\.\d+)/m);
  if (!m) throw new Error('no version in [pkg.rust]');
  process.stdout.write(m[1]);
  process.exit(0);
}

if (args.includes('--download')) {
  const version = flag('--version');
  const target = flag('--target');
  if (!version || !target) throw new Error('--version and --target are required');
  await mkdir(OUT, { recursive: true });

  const components = ['rustc', 'cargo', 'rust-std', 'rust-mingw'];
  for (const comp of components) {
    const file = `${comp}-${version}-${target}.tar.gz`;
    const dest = path.join(OUT, file);
    try {
      const s = await stat(dest);
      if (s.size > 1024) { console.log(`cached  ${file} (${(s.size / 1048576).toFixed(1)} MB)`); continue; }
    } catch { /* not cached */ }

    let res;
    try {
      res = await fetchWithFallback(`${file}`);
    } catch (e) {
      if (comp === 'rust-mingw') { console.log(`skip    ${file} (${e.message})`); continue; }
      throw e;
    }
    process.stdout.write(`get     ${file} ... `);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
    const s = await stat(dest);
    console.log(`${(s.size / 1048576).toFixed(1)} MB`);
  }
  process.exit(0);
}

console.error('usage: --resolve | --download --version <v> --target <t> [--out dir]');
process.exit(2);
