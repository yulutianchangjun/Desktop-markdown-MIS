<script setup lang="ts">
import { computed } from 'vue';

import AppIcon from '@/components/AppIcon.vue';
import BentoCard from '@/components/BentoCard.vue';
import DocumentList from '@/components/DocumentList.vue';
import { useDocumentsStore } from '@/stores/documents';
import { formatDateTime, monthLabel, relativeTime } from '@/lib/time';

const props = defineProps<{ dragActive: boolean; busy?: boolean }>();
const emit = defineEmits<{ browse: [] }>();

const docs = useDocumentsStore();

const monthTitle = computed(() =>
  docs.currentMonth ? monthLabel(docs.currentMonth.key) : monthLabel(monthKeyNow()),
);

function monthKeyNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}`;
}
</script>

<template>
  <div class="dashboard">
    <!-- 1. 拖拽导入区 -->
    <section class="bento drop-zone" :class="{ active: props.dragActive }" style="grid-area: drop">
      <div class="drop-inner">
        <div class="drop-badge">
          <AppIcon name="import" :size="26" :stroke-width="1.5" />
        </div>
        <h2 class="drop-title">
          {{ props.dragActive ? '释放以导入 Markdown' : '把 .md 文件拖到这里' }}
        </h2>
        <p class="drop-sub">
          支持单选 / 多选，亦可拖到窗口任意位置；文件名将作为文档标题，源码即时落库。
        </p>
        <button class="ghost-btn is-primary" :disabled="props.busy" @click="emit('browse')">
          <AppIcon name="plus" :size="15" />
          {{ props.busy ? '导入中…' : '选择文件' }}
        </button>
      </div>
    </section>

    <!-- 2. 最近编辑 -->
    <BentoCard title="最近编辑" icon="sparkle" span="recent">
      <template #actions>
        <button class="ghost-btn" @click="docs.go('documents')">全部文档</button>
      </template>
      <DocumentList
        :items="docs.recent"
        show-category
        empty-text="还没有文档。拖入一个 .md 文件，或点击「选择文件」开始。"
        @open="docs.openDocument"
      />
    </BentoCard>

    <!-- 3. 时间轴概览 -->
    <BentoCard :title="`时间轴概览 · ${monthTitle}`" icon="timeline" span="timeline">
      <template #actions>
        <button class="ghost-btn" @click="docs.go('timeline')">完整时间轴</button>
      </template>

      <div v-if="!docs.currentMonth" class="empty-hint">
        本月还没有创作或导入足迹。导入的文档会按时间节点出现在这里。
      </div>

      <ol v-else class="flow">
        <li v-for="item in docs.currentMonth.items" :key="item.id" class="flow-node">
          <span class="node-dot" />
          <button class="node-body" @click="docs.openDocument(item.id)">
            <span class="node-title">{{ item.title }}</span>
            <span class="node-meta">
              {{ formatDateTime(item.created_at) }} · 更新于 {{ relativeTime(item.updated_at) }}
            </span>
          </button>
        </li>
      </ol>
    </BentoCard>

    <!-- 4. 快捷状态统计 -->
    <BentoCard title="快捷状态统计" icon="database" span="stats">
      <div class="stats">
        <div class="stat">
          <span class="stat-num">{{ docs.stats.total }}</span>
          <span class="stat-label">总文档数</span>
        </div>
        <div class="stat">
          <span class="stat-num">{{ docs.stats.categories }}</span>
          <span class="stat-label">分类总数</span>
        </div>
        <div class="stat">
          <span class="stat-num">{{ docs.stats.weekUpdates }}</span>
          <span class="stat-label">本周更新量</span>
        </div>
        <div class="stat">
          <span class="stat-num">{{ docs.stats.archived }}</span>
          <span class="stat-label">归档 / 废纸篓</span>
        </div>
      </div>
    </BentoCard>
  </div>
</template>

<style scoped>
.dashboard {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  grid-template-rows: minmax(228px, 1.15fr) minmax(190px, 1fr);
  grid-template-areas:
    'drop drop drop recent recent recent'
    'timeline timeline timeline stats stats stats';
  height: 100%;
  min-height: 0;
}

/* --- 拖拽导入区 --- */
.drop-zone {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--md-theme-color) 30%, var(--app-border));
  align-items: center;
  justify-content: center;
  text-align: center;
}
.drop-zone::after {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  pointer-events: none;
  opacity: 0;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--md-theme-color) 45%, transparent);
  transition: opacity 0.25s ease;
}
.drop-zone:hover::after {
  opacity: 1;
  animation: breathe 2.6s ease-in-out infinite;
}
.drop-zone.active {
  border-style: solid;
  border-color: var(--md-theme-color);
  background: color-mix(in srgb, var(--md-theme-color) 9%, var(--app-surface));
}
.drop-zone.active::after {
  opacity: 1;
  animation: breathe 1.4s ease-in-out infinite;
}

@keyframes breathe {
  0%,
  100% {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--md-theme-color) 32%, transparent);
  }
  50% {
    box-shadow: inset 0 0 22px 2px color-mix(in srgb, var(--md-theme-color) 22%, transparent);
  }
}

.drop-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 8px 20px;
}

.drop-badge {
  width: 60px;
  height: 60px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  color: var(--md-theme-color);
  border: 1px solid color-mix(in srgb, var(--md-theme-color) 32%, transparent);
  background: color-mix(in srgb, var(--md-theme-color) 10%, transparent);
}

.drop-title {
  margin: 0;
  font-size: 1.02rem;
  font-weight: 650;
  color: var(--app-text-strong);
}

.drop-sub {
  margin: 0;
  max-width: 34ch;
  font-size: 0.78rem;
  line-height: 1.65;
  color: var(--app-text-dim);
}

/* --- 时间轴节点流 --- */
.flow {
  list-style: none;
  margin: 0;
  padding: 0 0 0 4px;
  display: flex;
  flex-direction: column;
}
.flow-node {
  position: relative;
  display: flex;
  gap: 12px;
  padding: 0 0 14px 2px;
}
.flow-node:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 14px;
  bottom: 0;
  width: 1px;
  background: var(--app-border);
}
.node-dot {
  position: relative;
  z-index: 1;
  margin-top: 5px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: none;
  background: var(--md-theme-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--md-theme-color) 16%, transparent);
}
.node-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  padding: 2px 6px;
  border-radius: var(--app-radius-sm);
  transition: background 0.15s ease;
}
.node-body:hover {
  background: var(--app-surface-hover);
}
.node-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--app-text-strong);
}
.node-meta {
  font-size: 0.72rem;
  color: var(--app-text-dim);
}

/* --- 统计 --- */
.stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  height: 100%;
}
.stat {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding: 10px 14px;
  border-radius: var(--app-radius-md);
  border: 1px solid var(--app-border);
  background: var(--app-raised);
}
.stat-num {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--md-theme-color);
  line-height: 1.15;
}
.stat-label {
  font-size: 0.74rem;
  color: var(--app-text-dim);
}
</style>
