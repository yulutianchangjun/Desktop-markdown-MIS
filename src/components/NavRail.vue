<script setup lang="ts">
import { computed, nextTick } from 'vue';
import AppIcon from './AppIcon.vue';
import logoUrl from '@/assets/logo.png';
import { useDocumentsStore, type RouteKey } from '@/stores/documents';
import { useSettingsStore } from '@/stores/settings';

const docs = useDocumentsStore();
const settings = useSettingsStore();

interface RailItem {
  key: RouteKey;
  icon: string;
  label: string;
  badge?: () => number;
}

const primary: RailItem[] = [
  { key: 'documents', icon: 'library', label: '全部文档', badge: () => docs.stats.total },
  { key: 'categories', icon: 'folder', label: '分类目录' },
  { key: 'timeline', icon: 'timeline', label: '时间轴流' },
  { key: 'trash', icon: 'trash', label: '废纸篓 / 归档', badge: () => docs.stats.archived },
];

const active = computed(() => (docs.editorOpen ? null : docs.route));

/** 等编辑器挂载出可编辑区之后把焦点交给正文（新建文档要能立刻开始敲）。 */
async function focusEditorBody(attempts = 12): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    await nextTick();
    const el = document.querySelector<HTMLElement>('.editor-host .cm-content');
    if (el) {
      el.focus();
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 40));
  }
}

/** 快速新建：直接建草稿并进编辑器，不经任何弹窗。 */
async function handleCreateNewDoc(): Promise<void> {
  // 纯阅览模式下没有可编辑区，新建时先切到源码模式。
  if (settings.viewMode === 'preview') await settings.setViewMode('source');

  const id = await docs.createNewDraft();
  if (id === null) return;
  await focusEditorBody();
}
</script>

<template>
  <nav class="rail">
    <!-- 顶部品牌区：点击回到 Bento 仪表盘 -->
    <div class="rail-top">
      <button
        class="brand"
        :class="{ active: docs.route === 'dashboard' && !docs.editorOpen }"
        title="首页"
        @click="docs.go('dashboard')"
      >
        <img :src="logoUrl" class="brand-logo" alt="Md-Mis" />
      </button>
    </div>

    <!-- 中部核心路由区 -->
    <div class="rail-mid">
      <button class="rail-item create" title="新建文档" @click="handleCreateNewDoc">
        <AppIcon name="plus" :size="19" />
        <span class="tip">新建文档</span>
      </button>
      <button
        v-for="item in primary"
        :key="item.key"
        class="rail-item"
        :class="{ active: active === item.key }"
        :title="item.label"
        @click="docs.go(item.key)"
      >
        <AppIcon :name="item.icon" :size="19" />
        <span
          v-if="item.badge && item.badge() > 0"
          class="badge"
          :class="{ wide: item.badge() > 99 }"
          >{{ item.badge() > 99 ? '99+' : item.badge() }}</span
        >
        <span class="tip">{{ item.label }}</span>
      </button>
    </div>

    <!-- 底部系统区 -->
    <div class="rail-bottom">
      <button
        class="rail-item"
        :class="{ active: active === 'settings' }"
        title="系统设置"
        @click="docs.go('settings')"
      >
        <AppIcon name="sliders" :size="19" />
        <span class="tip">系统设置</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.rail {
  width: 72px;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  gap: 4px;
  background: var(--app-bg);
  border-right: 1px solid var(--app-border);
}

.rail-top {
  flex: none;
  padding-bottom: 10px;
  margin-bottom: 8px;
  width: 100%;
  display: flex;
  justify-content: center;
  border-bottom: 1px solid var(--app-border);
}

.brand {
  width: 44px;
  height: 44px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  color: var(--app-text);
  border: 1px solid var(--app-border);
  background: var(--app-surface);
  transition:
    color 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}
.brand:hover,
.brand.active {
  color: var(--md-theme-color);
  border-color: color-mix(in srgb, var(--md-theme-color) 50%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--md-theme-color) 12%, transparent);
}

/* 品牌 Logo：方形原图自带米白底，做成圆角小方块后像一枚应用图标 */
.brand-logo {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  object-fit: contain;
  display: block;
  user-select: none;
  -webkit-user-drag: none;
}

/* 「新建文档」快捷入口：用虚线描边强调它是“添加”动作 */
.rail-item.create {
  color: var(--md-theme-color);
  border: 1px dashed color-mix(in srgb, var(--md-theme-color) 45%, transparent);
}
.rail-item.create:hover {
  color: var(--md-theme-color);
  background: color-mix(in srgb, var(--md-theme-color) 14%, transparent);
  border-style: solid;
}

.rail-mid {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-height: 0;
}

.rail-bottom {
  flex: none;
  padding-top: 10px;
  margin-top: 8px;
  border-top: 1px solid var(--app-border);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.rail-item {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: var(--app-text-dim);
  transition:
    color 0.16s ease,
    background 0.16s ease;
}
.rail-item:hover {
  color: var(--app-text-strong);
  background: var(--app-surface-hover);
}
.rail-item.active {
  color: var(--md-theme-color);
  background: color-mix(in srgb, var(--md-theme-color) 13%, transparent);
}
/* 当前选中项的高亮指示条，取当前主题强调色 */
.rail-item.active::before {
  content: '';
  position: absolute;
  left: -14px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  border-radius: 0 3px 3px 0;
  background: var(--md-theme-color);
}

.badge {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--md-theme-color);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 15px;
  text-align: center;
}
.badge.wide {
  font-size: 8px;
}

.tip {
  position: absolute;
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%) translateX(-4px);
  padding: 5px 9px;
  border-radius: 7px;
  background: var(--app-raised);
  border: 1px solid var(--app-border);
  color: var(--app-text-strong);
  font-size: 0.76rem;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
  z-index: 40;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}
.rail-item:hover .tip,
.brand:hover + .tip {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
}
</style>
