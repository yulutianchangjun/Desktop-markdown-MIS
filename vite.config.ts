import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

import { sqlPreviewPlugin } from './tools/vite-sql-preview.mjs';

// Tauri injects these during `tauri dev` / `tauri build`.
const host = process.env.TAURI_DEV_HOST;

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    vue(),
    // 仅为 `pnpm dev` 提供 SQLite 后端，让界面能在普通浏览器里用真实数据库预览。
    // `pnpm build` 时该插件不生效（apply: 'serve'）。
    sqlPreviewPlugin({ root: rootDir }),
  ],
  resolve: {
    alias: {
      // fileURLToPath keeps Windows drive letters intact (a raw .pathname yields "/E:/...").
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Keep Rust's compiler output on screen during `tauri dev`.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**', '**/.rust/**', '**/.toolchain-dl/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    // Tauri ships a modern WebView2 on Windows.
    target: 'chrome105',
    // Vite 8 minifies with Oxc; esbuild is no longer bundled as a transformer.
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
