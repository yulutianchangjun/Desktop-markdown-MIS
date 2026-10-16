<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';

import AppIcon from '@/components/AppIcon.vue';
import BentoCard from '@/components/BentoCard.vue';
import { journalMode } from '@/db';
import { isTauriRuntime } from '@/db/transport';
import { CODE_THEMES, PREVIEW_THEMES } from '@/lib/themes';
import { useDocumentsStore } from '@/stores/documents';
import { useSettingsStore, type ViewMode } from '@/stores/settings';

const settings = useSettingsStore();
const docs = useDocumentsStore();

const dbFile = ref('读取中…');
const journal = ref('读取中…');
const exporting = ref(false);
const exportNotice = ref<string | null>(null);

const MODES: { key: ViewMode; label: string }[] = [
  { key: 'preview', label: '纯阅览' },
  { key: 'split', label: '双模式' },
  { key: 'source', label: '纯源码' },
];

onMounted(async () => {
  if (!isTauriRuntime()) {
    dbFile.value = '浏览器预览模式：数据库位于工作区 .scratch/preview/data.db';
  } else {
    try {
      dbFile.value = await invoke<string>('db_path');
    } catch (e) {
      dbFile.value = `读取失败：${e instanceof Error ? e.message : String(e)}`;
    }
  }
  try {
    journal.value = await journalMode();
  } catch (e) {
    journal.value = `读取失败：${e instanceof Error ? e.message : String(e)}`;
  }
});

/** 数据备份 / 全库导出：把每篇文档源码写成外部 .md 文件。 */
async function exportAll(): Promise<void> {
  exporting.value = true;
  exportNotice.value = null;
  try {
    const n = await docs.exportAll();
    exportNotice.value = n ? `已导出 ${n} 篇 Markdown 文件。` : '已取消。';
  } catch (e) {
    exportNotice.value = `导出失败：${e instanceof Error ? e.message : String(e)}`;
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <div class="settings">
    <BentoCard title="外观" icon="palette">
      <div class="row">
        <div class="row-label">
          <span class="label">明暗模式</span>
          <span class="desc">切换时外层容器与编辑器 :theme 属性同步变更</span>
        </div>
        <div class="seg">
          <button
            class="seg-btn"
            :class="{ active: settings.theme === 'dark' }"
            @click="settings.setTheme('dark')"
          >
            <AppIcon name="moon" :size="14" /> 深色
          </button>
          <button
            class="seg-btn"
            :class="{ active: settings.theme === 'light' }"
            @click="settings.setTheme('light')"
          >
            <AppIcon name="sun" :size="14" /> 浅色
          </button>
        </div>
      </div>

      <div class="row">
        <div class="row-label">
          <span class="label">正文字号</span>
          <span class="desc">当前 {{ settings.fontSize }}px</span>
        </div>
        <input
          class="slider"
          type="range"
          min="12"
          max="22"
          step="1"
          :value="settings.fontSize"
          @input="settings.setFontSize(Number(($event.target as HTMLInputElement).value))"
        />
      </div>

      <div class="row">
        <div class="row-label">
          <span class="label">正文排版主题</span>
          <span class="desc">复用 md-editor-v3 内置预设，强调色随之绑定</span>
        </div>
        <select
          class="field compact"
          :value="settings.previewTheme"
          @change="settings.setPreviewTheme(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="t in PREVIEW_THEMES" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
      </div>

      <div class="row">
        <div class="row-label">
          <span class="label">代码高亮配色</span>
          <span class="desc">复用内置 atom / github / stackoverflow 等配色</span>
        </div>
        <select
          class="field compact"
          :value="settings.codeTheme"
          @change="settings.setCodeTheme(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="t in CODE_THEMES" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
      </div>

      <div class="row">
        <div class="row-label">
          <span class="label">默认编辑模式</span>
          <span class="desc">下次打开文档时使用的三态模式</span>
        </div>
        <div class="seg">
          <button
            v-for="m in MODES"
            :key="m.key"
            class="seg-btn"
            :class="{ active: settings.viewMode === m.key }"
            @click="settings.setViewMode(m.key)"
          >
            {{ m.label }}
          </button>
        </div>
      </div>
    </BentoCard>

    <BentoCard title="数据与存储" icon="database">
      <div class="kv">
        <span class="kv-key">数据库文件</span>
        <code class="kv-val">{{ dbFile }}</code>
      </div>
      <div class="kv">
        <span class="kv-key">journal_mode</span>
        <code class="kv-val">{{ journal }}</code>
      </div>
      <div class="kv">
        <span class="kv-key">文档统计</span>
        <code class="kv-val">
          {{ docs.stats.total }} 篇正常 · {{ docs.stats.archived }} 篇归档 ·
          {{ docs.stats.categories }} 个分类
        </code>
      </div>

      <div class="actions">
        <button class="ghost-btn is-primary" :disabled="exporting" @click="exportAll">
          <AppIcon name="download" :size="15" />
          {{ exporting ? '导出中…' : '备份 / 全库导出为 .md' }}
        </button>
        <button class="ghost-btn" @click="docs.load()">
          <AppIcon name="restore" :size="15" />
          重新读取数据库
        </button>
      </div>
      <p v-if="exportNotice" class="notice">{{ exportNotice }}</p>
    </BentoCard>
  </div>
</template>

<style scoped>
.settings {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 11px 0;
  border-bottom: 1px solid var(--app-border);
}
.row:last-child {
  border-bottom: none;
}

.row-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.label {
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--app-text-strong);
}
.desc {
  font-size: 0.74rem;
  color: var(--app-text-dim);
}

.seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 9px;
  border: 1px solid var(--app-border);
  background: var(--app-raised);
  flex: none;
}
.seg-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  border-radius: 7px;
  font-size: 0.78rem;
  color: var(--app-text-dim);
  transition:
    color 0.15s ease,
    background 0.15s ease;
}
.seg-btn:hover {
  color: var(--app-text-strong);
}
.seg-btn.active {
  color: var(--md-theme-color);
  background: color-mix(in srgb, var(--md-theme-color) 15%, transparent);
}

.field.compact {
  width: 168px;
  flex: none;
}

.slider {
  width: 200px;
  flex: none;
  accent-color: var(--md-theme-color);
  cursor: pointer;
}

.kv {
  display: flex;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--app-border);
  align-items: baseline;
}
.kv-key {
  flex: none;
  width: 96px;
  font-size: 0.76rem;
  color: var(--app-text-dim);
}
.kv-val {
  flex: 1;
  min-width: 0;
  font-size: 0.76rem;
  color: var(--app-text-strong);
  word-break: break-all;
  line-height: 1.6;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
  flex-wrap: wrap;
}

.notice {
  margin: 10px 0 0;
  font-size: 0.76rem;
  color: var(--md-theme-color);
}
</style>
