<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

import AppIcon from '@/components/AppIcon.vue';
import NavRail from '@/components/NavRail.vue';
import TitleBar from '@/components/TitleBar.vue';
import CategoriesView from '@/views/CategoriesView.vue';
import DashboardView from '@/views/DashboardView.vue';
import DocumentsView from '@/views/DocumentsView.vue';
import EditorView from '@/views/EditorView.vue';
import SettingsView from '@/views/SettingsView.vue';
import TimelineView from '@/views/TimelineView.vue';
import TrashView from '@/views/TrashView.vue';

import { useDocumentsStore } from '@/stores/documents';
import { useSettingsStore } from '@/stores/settings';
import type { ImportOutcome } from '@/stores/documents';
import { isTauriRuntime } from '@/db/transport';

const settings = useSettingsStore();
const docs = useDocumentsStore();

const booted = ref(false);
const bootError = ref<string | null>(null);

const dragActive = ref(false);
const importing = ref(false);
const toast = ref<string | null>(null);
let toastTimer: number | null = null;

let unlisten: (() => void) | null = null;

const shellStyle = computed(() => ({
  '--md-theme-color': settings.accent,
  '--app-font-size': `${settings.fontSize}px`,
}));

function flash(text: string): void {
  toast.value = text;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.value = null;
    toastTimer = null;
  }, 3600);
}

function describe(outcome: ImportOutcome): string {
  const parts = [`成功导入 ${outcome.imported.length} 篇`];
  if (outcome.skipped.length) parts.push(`跳过 ${outcome.skipped.length} 个非 Markdown 文件`);
  if (outcome.failed.length) parts.push(`失败 ${outcome.failed.length} 个`);
  return parts.join('，');
}

async function importFrom(paths: string[]): Promise<void> {
  if (!paths.length) return;
  importing.value = true;
  try {
    flash(describe(await docs.importPaths(paths)));
  } catch (e) {
    flash(`导入失败：${e instanceof Error ? e.message : String(e)}`);
  } finally {
    importing.value = false;
  }
}

async function browse(): Promise<void> {
  if (!isTauriRuntime()) {
    flash('浏览器预览模式不支持系统文件对话框，请在桌面程序中使用导入功能。');
    return;
  }
  const picked = await openDialog({
    multiple: true,
    title: '导入 Markdown 文件',
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdx'] }],
  });
  if (!picked) return;
  await importFrom(Array.isArray(picked) ? picked : [picked]);
}

onMounted(async () => {
  try {
    // 先取配置（主题决定首屏配色），再取文档。
    await settings.load();
    await docs.init();
    booted.value = true;
  } catch (e) {
    bootError.value = e instanceof Error ? e.message : String(e);
  }

  // 导入流：Tauri 原生拖拽事件给出文件绝对路径。
  // 浏览器预览下没有该事件（也不能读本地路径），静默跳过。
  if (isTauriRuntime()) {
    unlisten = await getCurrentWebview().onDragDropEvent(async (event) => {
      const payload = event.payload;
      if (payload.type === 'over' || payload.type === 'enter') {
        dragActive.value = true;
        return;
      }
      dragActive.value = false;
      if (payload.type === 'drop') await importFrom(payload.paths);
    });
  }
});

onUnmounted(() => {
  unlisten?.();
  if (toastTimer !== null) window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="app-shell" :data-theme="settings.theme" :style="shellStyle">
    <NavRail />

    <div class="main-col">
      <TitleBar />

      <main class="workspace">
        <div v-if="bootError" class="boot-error">
          <AppIcon name="database" :size="26" />
          <h2>数据库初始化失败</h2>
          <p>{{ bootError }}</p>
        </div>

        <div v-else-if="!booted" class="booting">正在初始化本地数据库…</div>

        <EditorView v-else-if="docs.editorOpen" />

        <template v-else>
          <DashboardView
            v-if="docs.route === 'dashboard'"
            :drag-active="dragActive"
            :busy="importing"
            @browse="browse"
          />
          <DocumentsView v-else-if="docs.route === 'documents'" />
          <CategoriesView v-else-if="docs.route === 'categories'" />
          <TimelineView v-else-if="docs.route === 'timeline'" />
          <TrashView v-else-if="docs.route === 'trash'" />
          <SettingsView v-else-if="docs.route === 'settings'" />
        </template>
      </main>
    </div>

    <!-- 拖入窗口任意位置时的全局提示 -->
    <div v-if="dragActive" class="drag-overlay">
      <div class="drag-card">
        <AppIcon name="import" :size="30" :stroke-width="1.5" />
        <span>释放以导入 Markdown</span>
      </div>
    </div>

    <Transition name="toast">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.main-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.workspace {
  flex: 1;
  min-height: 0;
  padding: 14px;
  overflow: auto;
}

.booting,
.boot-error {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--app-text-dim);
  font-size: 0.86rem;
  text-align: center;
}
.boot-error {
  color: #e5544b;
}
.boot-error h2 {
  margin: 0;
  font-size: 1rem;
  color: var(--app-text-strong);
}
.boot-error p {
  margin: 0;
  max-width: 60ch;
  color: var(--app-text-dim);
  word-break: break-all;
}

.drag-overlay {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--app-bg) 72%, transparent);
  backdrop-filter: blur(3px);
  pointer-events: none;
}
.drag-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 34px 52px;
  border-radius: 20px;
  border: 1.5px dashed var(--md-theme-color);
  background: color-mix(in srgb, var(--md-theme-color) 8%, var(--app-surface));
  color: var(--app-text-strong);
  font-size: 0.95rem;
  font-weight: 600;
  box-shadow: 0 0 0 8px color-mix(in srgb, var(--md-theme-color) 7%, transparent);
}
.drag-card :deep(.app-icon) {
  color: var(--md-theme-color);
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 26px;
  transform: translateX(-50%);
  z-index: 950;
  padding: 10px 18px;
  border-radius: 11px;
  border: 1px solid color-mix(in srgb, var(--md-theme-color) 40%, transparent);
  background: var(--app-raised);
  color: var(--app-text-strong);
  font-size: 0.82rem;
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.45);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
