<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

import AppIcon from './AppIcon.vue';
import { useDocumentsStore } from '@/stores/documents';
import { useSettingsStore } from '@/stores/settings';
import { isTauriRuntime } from '@/db/transport';

const docs = useDocumentsStore();
const settings = useSettingsStore();

// 浏览器预览下没有原生窗口，控件保持可见但不再绑定行为。
const appWindow = isTauriRuntime() ? getCurrentWindow() : null;
const maximized = ref(false);
let unlisten: (() => void) | null = null;

onMounted(async () => {
  if (!appWindow) return;
  maximized.value = await appWindow.isMaximized();
  unlisten = await appWindow.onResized(async () => {
    maximized.value = await appWindow.isMaximized();
  });
});

onUnmounted(() => unlisten?.());

async function pickFiles(): Promise<void> {
  if (!isTauriRuntime()) return;
  const picked = await openDialog({
    multiple: true,
    title: '导入 Markdown 文件',
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdx'] }],
  });
  if (!picked) return;
  const paths = Array.isArray(picked) ? picked : [picked];
  await docs.importPaths(paths);
}
</script>

<template>
  <!-- 无边框窗口：整条顶栏为拖拽区域，右侧为原生窗口控制 -->
  <header class="title-bar" data-tauri-drag-region>
    <div class="left" data-tauri-drag-region>
      <span class="app-name" data-tauri-drag-region>Local DMS</span>
      <span class="divider" data-tauri-drag-region />
      <span class="crumb" data-tauri-drag-region>
        {{ docs.editorOpen ? docs.current?.title ?? '未命名文档' : '本地 Markdown 文档管理' }}
      </span>
      <span v-if="docs.editorOpen && docs.saveState === 'dirty'" class="dot dirty" title="有未保存的修改" />
      <span v-else-if="docs.editorOpen && docs.saveState === 'saved'" class="dot saved" title="已保存" />
    </div>

    <div class="right">
      <div class="search">
        <AppIcon name="search" :size="15" />
        <input
          v-model="docs.search"
          class="search-input"
          type="search"
          placeholder="搜索标题 / 分类 / 标签 / 正文"
        />
      </div>

      <button class="icon-btn" title="导入 Markdown（也可直接拖入窗口）" @click="pickFiles">
        <AppIcon name="import" :size="16" />
      </button>

      <button
        class="icon-btn"
        :title="settings.theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
        @click="settings.toggleTheme()"
      >
        <AppIcon :name="settings.theme === 'dark' ? 'sun' : 'moon'" :size="16" />
      </button>

      <div class="win-controls">
        <button class="win-btn" title="最小化" @click="appWindow?.minimize()">
          <AppIcon name="minimize" :size="15" />
        </button>
        <button
          class="win-btn"
          :title="maximized ? '还原' : '最大化'"
          @click="appWindow?.toggleMaximize()"
        >
          <AppIcon :name="maximized ? 'restoreWindow' : 'maximize'" :size="15" />
        </button>
        <button class="win-btn danger" title="关闭" @click="appWindow?.close()">
          <AppIcon name="close" :size="15" />
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.title-bar {
  height: 46px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-left: 16px;
  border-bottom: 1px solid var(--app-border);
  user-select: none;
}

.left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.app-name {
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--md-theme-color);
}
.divider {
  width: 1px;
  height: 14px;
  background: var(--app-border);
}
.crumb {
  font-size: 0.84rem;
  color: var(--app-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 46vw;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: none;
}
.dot.dirty {
  background: #e8a33d;
  box-shadow: 0 0 0 3px rgba(232, 163, 61, 0.16);
}
.dot.saved {
  background: #3ecf8e;
  box-shadow: 0 0 0 3px rgba(62, 207, 142, 0.16);
}

.right {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
}

.search {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--app-border);
  background: var(--app-surface);
  color: var(--app-text-dim);
  width: 240px;
}
.search:focus-within {
  border-color: color-mix(in srgb, var(--md-theme-color) 55%, transparent);
}
.search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--app-text-strong);
  font-size: 0.8rem;
}
.search-input::placeholder {
  color: var(--app-text-dim);
}
.search-input::-webkit-search-cancel-button {
  display: none;
}

.icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: var(--app-text-dim);
  border: 1px solid transparent;
  transition:
    color 0.16s ease,
    background 0.16s ease,
    border-color 0.16s ease;
}
.icon-btn:hover {
  color: var(--md-theme-color);
  background: var(--app-surface-hover);
  border-color: var(--app-border);
}

.win-controls {
  display: flex;
  align-items: center;
  height: 100%;
  margin-left: 4px;
}
.win-btn {
  width: 44px;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--app-text-dim);
  transition:
    background 0.14s ease,
    color 0.14s ease;
}
.win-btn:hover {
  background: var(--app-surface-hover);
  color: var(--app-text-strong);
}
.win-btn.danger:hover {
  background: #e81123;
  color: #fff;
}
</style>
