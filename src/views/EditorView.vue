<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { MdEditor, MdPreview } from 'md-editor-v3';
import type { ExposeParam, ToolbarNames } from 'md-editor-v3';

import AppIcon from '@/components/AppIcon.vue';
import { useDocumentsStore } from '@/stores/documents';
import { useSettingsStore, type ViewMode } from '@/stores/settings';
import { CODE_THEMES, PREVIEW_THEMES } from '@/lib/themes';

const docs = useDocumentsStore();
const settings = useSettingsStore();

const notice = ref<string | null>(null);

/**
 * md-editor-v3 的 `preview` 属性只在挂载时生效，之后切换不会恢复预览栏，
 * 因此三态里的「双模式 / 纯源码」用组件暴露的 togglePreview() 来切换，
 * 避免整块重挂载（那会丢掉撤销历史与光标位置）。
 */
const editorRef = ref<ExposeParam | null>(null);

watch(
  () => settings.viewMode,
  (mode) => {
    if (mode === 'split') editorRef.value?.togglePreview(true);
    else if (mode === 'source') editorRef.value?.togglePreview(false);
  },
);

const doc = computed(() => docs.current);
const editorId = computed(() => `dms-editor-${docs.selectedId ?? 'none'}`);

const toolbars: ToolbarNames[] = [
  'bold',
  'italic',
  'strikeThrough',
  '-',
  'title',
  'quote',
  'unorderedList',
  'orderedList',
  'task',
  '-',
  'codeRow',
  'code',
  'link',
  'image',
  'table',
  '-',
  'revoke',
  'next',
  '=',
  'catalog',
  'save',
];

const MODES: { key: ViewMode; icon: string; label: string }[] = [
  { key: 'preview', icon: 'eye', label: '纯阅览模式' },
  { key: 'split', icon: 'columns', label: '双模式（分屏对照）' },
  { key: 'source', icon: 'code', label: '纯源码模式' },
];

async function save(): Promise<void> {
  const ok = await docs.saveCurrent();
  flash(ok ? '已保存到 SQLite' : '保存失败');
}

async function exportDoc(): Promise<void> {
  const target = await docs.exportCurrent();
  if (target) flash(`已导出到 ${target}`);
}

function flash(text: string): void {
  notice.value = text;
  window.setTimeout(() => {
    if (notice.value === text) notice.value = null;
  }, 2600);
}

/**
 * 提交标题。必须从事件里读输入值：`docs.current` 还是库里的旧标题，
 * 直接用它会把用户输入丢掉（改名等于无效）。
 */
async function commitTitle(event: Event): Promise<void> {
  const row = doc.value;
  const input = event.target as HTMLInputElement;
  if (!row) return;

  const next = input.value.trim();
  if (!next || next === row.title) {
    input.value = row.title; // 空标题或未改动：恢复成库里的值
    return;
  }
  await docs.patchMeta(row.id, { title: next });
}

async function commitMeta(patch: { category?: string; tags?: string }) {
  const row = doc.value;
  if (!row) return;
  await docs.patchMeta(row.id, patch);
}

// MdEditor 的 v-model 走 docs.draft，任何输入都标记为未保存。
watch(
  () => docs.draft,
  () => {
    if (docs.editorOpen) docs.markDirty();
  },
);

function onKeydown(event: KeyboardEvent): void {
  if (!docs.editorOpen) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    void save();
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <section class="bento editor-card">
    <!-- 操作头 -->
    <header class="op-bar">
      <button class="icon-btn" title="返回" @click="docs.closeEditor()">
        <AppIcon name="arrowLeft" :size="17" />
      </button>

      <input
        class="title-input"
        :value="doc?.title ?? ''"
        placeholder="文档标题"
        @change="commitTitle"
        @keydown.enter="($event.target as HTMLInputElement).blur()"
      />

      <div class="meta-inputs">
        <input
          class="meta-input"
          :value="doc?.category ?? ''"
          placeholder="分类（支持 父级/子级）"
          title="分类路径，用 / 分隔即可形成多级目录"
          @change="
            commitMeta({ category: ($event.target as HTMLInputElement).value })
          "
        />
        <input
          class="meta-input"
          :value="doc?.tags ?? ''"
          placeholder="标签（英文逗号分隔）"
          @change="commitMeta({ tags: ($event.target as HTMLInputElement).value })"
        />
      </div>

      <!-- 三态模式切换 -->
      <div class="mode-switch">
        <button
          v-for="m in MODES"
          :key="m.key"
          class="mode-btn"
          :class="{ active: settings.viewMode === m.key }"
          :title="m.label"
          @click="settings.setViewMode(m.key)"
        >
          <AppIcon :name="m.icon" :size="15" />
        </button>
      </div>

      <!-- 排版主题下拉 -->
      <label class="theme-select" title="正文排版主题">
        <AppIcon name="palette" :size="15" />
        <select
          :value="settings.previewTheme"
          @change="settings.setPreviewTheme(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="t in PREVIEW_THEMES" :key="t.value" :value="t.value">
            {{ t.label }}
          </option>
        </select>
        <AppIcon name="chevronDown" :size="13" />
      </label>

      <label class="theme-select" title="代码高亮配色">
        <AppIcon name="code" :size="15" />
        <select
          :value="settings.codeTheme"
          @change="settings.setCodeTheme(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="t in CODE_THEMES" :key="t.value" :value="t.value">
            {{ t.label }}
          </option>
        </select>
        <AppIcon name="chevronDown" :size="13" />
      </label>

      <!-- 动作组整体不换行，窄窗口下一起折到第二行 -->
      <div class="op-actions">
        <span v-if="notice" class="notice">{{ notice }}</span>
        <button class="ghost-btn" :disabled="!doc" @click="exportDoc">
          <AppIcon name="download" :size="15" />
          导出
        </button>
        <button class="ghost-btn is-primary" :disabled="!doc" @click="save">
          <AppIcon name="save" :size="15" />
          保存
          <kbd>Ctrl+S</kbd>
        </button>
        <button
          class="ghost-btn"
          :disabled="!doc"
          title="移入废纸篓"
          @click="doc && docs.archive(doc.id)"
        >
          <AppIcon name="trash" :size="15" />
        </button>
      </div>
    </header>

    <!-- 编辑器主体：容器交由卡片，编辑器自身背景全透 -->
    <div class="editor-host">
      <MdPreview
        v-if="settings.viewMode === 'preview'"
        :id="editorId"
        v-model="docs.draft"
        :theme="settings.editorTheme"
        :preview-theme="settings.previewTheme"
        :code-theme="settings.codeTheme"
        language="zh-CN"
        class="md-full"
      />
      <MdEditor
        v-else
        :id="editorId"
        ref="editorRef"
        v-model="docs.draft"
        :theme="settings.editorTheme"
        :preview-theme="settings.previewTheme"
        :code-theme="settings.codeTheme"
        :preview="settings.viewMode === 'split'"
        :toolbars="toolbars"
        language="zh-CN"
        class="md-full"
        @on-save="save"
      />
    </div>
  </section>
</template>

<style scoped>
.editor-card {
  height: 100%;
  padding: 12px 14px 14px;
  gap: 10px;
}

.op-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex: none;
}

.icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: var(--app-text-dim);
  border: 1px solid var(--app-border);
  flex: none;
}
.icon-btn:hover {
  color: var(--md-theme-color);
  background: var(--app-surface-hover);
}

.title-input {
  width: 190px;
  padding: 6px 10px;
  border-radius: var(--app-radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--app-text-strong);
  font-size: 0.98rem;
  font-weight: 650;
  outline: none;
}
.title-input:hover {
  border-color: var(--app-border);
}
.title-input:focus {
  border-color: color-mix(in srgb, var(--md-theme-color) 55%, transparent);
  background: var(--app-raised);
}

.meta-inputs {
  display: flex;
  gap: 6px;
}
.meta-input {
  width: 148px;
  padding: 6px 9px;
  border-radius: var(--app-radius-sm);
  border: 1px solid var(--app-border);
  background: transparent;
  color: var(--app-text);
  font-size: 0.78rem;
  outline: none;
}
.meta-input:focus {
  border-color: color-mix(in srgb, var(--md-theme-color) 55%, transparent);
  background: var(--app-raised);
}

.mode-switch {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 9px;
  border: 1px solid var(--app-border);
  background: var(--app-raised);
}
.mode-btn {
  width: 30px;
  height: 26px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  color: var(--app-text-dim);
  transition:
    color 0.15s ease,
    background 0.15s ease;
}
.mode-btn:hover {
  color: var(--app-text-strong);
}
.mode-btn.active {
  color: var(--md-theme-color);
  background: color-mix(in srgb, var(--md-theme-color) 16%, transparent);
}

.theme-select {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 8px;
  border-radius: var(--app-radius-sm);
  border: 1px solid var(--app-border);
  color: var(--app-text-dim);
  background: transparent;
}
.theme-select:hover {
  border-color: color-mix(in srgb, var(--md-theme-color) 45%, transparent);
}
.theme-select select {
  appearance: none;
  border: none;
  outline: none;
  background: transparent;
  color: var(--app-text);
  font-size: 0.78rem;
  cursor: pointer;
  padding-right: 2px;
}
.theme-select select option {
  background: var(--app-raised);
  color: var(--app-text-strong);
}

/* 动作组整体靠右且内部不换行：窗口变窄时整组折到第二行，而不是被拆散。 */
.op-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  margin-left: auto;
}

.notice {
  font-size: 0.74rem;
  color: var(--md-theme-color);
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

kbd {
  font-size: 0.62rem;
  padding: 1px 4px;
  border-radius: 4px;
  border: 1px solid var(--app-border);
  color: var(--app-text-dim);
  font-family: inherit;
}

.editor-host {
  flex: 1;
  min-height: 0;
  border-radius: var(--app-radius-md);
  overflow: hidden;
}
.editor-host :deep(.md-full) {
  height: 100%;
}
</style>
