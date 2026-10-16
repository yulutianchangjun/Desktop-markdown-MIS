<script setup lang="ts">
import BentoCard from '@/components/BentoCard.vue';
import { useDocumentsStore } from '@/stores/documents';
import { formatDateTime, monthLabel, relativeTime } from '@/lib/time';

const docs = useDocumentsStore();
</script>

<template>
  <BentoCard title="时间轴流" icon="timeline">
    <template #actions>
      <span class="summary">按年 / 月归档 · {{ docs.timeline.length }} 个月份</span>
    </template>

    <div v-if="!docs.timeline.length" class="empty-hint">
      还没有可展示的时间轴。导入 Markdown 后，文档会按创建时间落入对应月份。
    </div>

    <div v-else class="months">
      <section v-for="group in docs.timeline" :key="group.key" class="month">
        <header class="month-head">
          <span class="month-label">{{ monthLabel(group.key) }}</span>
          <span class="month-count">{{ group.items.length }} 篇</span>
          <span class="month-rule" />
        </header>

        <ol class="flow">
          <li v-for="item in group.items" :key="item.id" class="flow-node">
            <span class="node-dot" />
            <button class="node-body" @click="docs.openDocument(item.id)">
              <span class="node-title">{{ item.title }}</span>
              <span class="node-meta">
                创建 {{ formatDateTime(item.created_at) }} · 更新 {{ relativeTime(item.updated_at) }}
                <template v-if="item.category"> · {{ item.category }}</template>
              </span>
            </button>
          </li>
        </ol>
      </section>
    </div>
  </BentoCard>
</template>

<style scoped>
.summary {
  font-size: 0.74rem;
  color: var(--app-text-dim);
}

.months {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.month-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.month-label {
  font-size: 0.88rem;
  font-weight: 650;
  color: var(--app-text-strong);
}
.month-count {
  font-size: 0.72rem;
  color: var(--md-theme-color);
  padding: 1px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--md-theme-color) 13%, transparent);
}
.month-rule {
  flex: 1;
  height: 1px;
  background: var(--app-border);
}

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
  padding-bottom: 12px;
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
  border: 1.5px solid var(--md-theme-color);
  background: var(--app-surface);
}
.node-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  padding: 2px 8px;
  border-radius: var(--app-radius-sm);
  transition: background 0.15s ease;
}
.node-body:hover {
  background: var(--app-surface-hover);
}
.node-title {
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--app-text-strong);
}
.node-meta {
  font-size: 0.72rem;
  color: var(--app-text-dim);
}
</style>
