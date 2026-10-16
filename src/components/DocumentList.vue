<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import { relativeTime } from '@/lib/time';
import { DEFAULT_CATEGORY, type DocumentRow } from '@/db';

const props = defineProps<{
  items: DocumentRow[];
  /** 是否显示分类徽标 */
  showCategory?: boolean;
  emptyText?: string;
}>();

const emit = defineEmits<{ open: [id: number] }>();

function tags(row: DocumentRow): string[] {
  return (row.tags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function excerpt(row: DocumentRow): string {
  const text = row.raw_content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`\-[\]()!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

function catLabel(row: DocumentRow): string {
  return row.category?.trim() || DEFAULT_CATEGORY;
}
</script>

<template>
  <div v-if="!props.items.length" class="empty-hint">{{ props.emptyText ?? '暂无文档。' }}</div>

  <ul v-else class="doc-list">
    <li
      v-for="row in props.items"
      :key="row.id"
      class="doc-row"
      :class="{ archived: row.is_archived === 1 }"
      @click="emit('open', row.id)"
    >
      <AppIcon name="file" :size="15" class="doc-glyph" />
      <div class="doc-main">
        <div class="doc-title-line">
          <span class="doc-title">{{ row.title }}</span>
          <span v-if="props.showCategory" class="chip cat">{{ catLabel(row) }}</span>
          <span v-for="t in tags(row)" :key="t" class="chip tag">#{{ t }}</span>
        </div>
        <p class="doc-excerpt">{{ excerpt(row) }}</p>
      </div>
      <div v-if="$slots.actions" class="doc-actions" @click.stop>
        <slot name="actions" :row="row" />
      </div>
      <time class="doc-time">{{ relativeTime(row.updated_at) }}</time>
    </li>
  </ul>
</template>

<style scoped>
.doc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.doc-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--app-radius-md);
  border: 1px solid transparent;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}
.doc-row:hover {
  background: var(--app-surface-hover);
  border-color: color-mix(in srgb, var(--md-theme-color) 35%, transparent);
}
.doc-row.archived .doc-title {
  text-decoration: line-through;
  opacity: 0.65;
}

.doc-glyph {
  margin-top: 2px;
  color: var(--app-text-dim);
}

.doc-main {
  flex: 1;
  min-width: 0;
}

.doc-title-line {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.doc-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--app-text-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.doc-excerpt {
  margin: 3px 0 0;
  font-size: 0.78rem;
  color: var(--app-text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.doc-time {
  flex: none;
  font-size: 0.72rem;
  color: var(--app-text-dim);
  white-space: nowrap;
  padding-top: 3px;
}

.doc-actions {
  flex: none;
  display: flex;
  gap: 4px;
  align-self: center;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.doc-row:hover .doc-actions {
  opacity: 1;
}

.chip {
  font-size: 0.68rem;
  padding: 1px 7px;
  border-radius: 999px;
  white-space: nowrap;
}
.chip.cat {
  color: var(--md-theme-color);
  background: color-mix(in srgb, var(--md-theme-color) 13%, transparent);
  border: 1px solid color-mix(in srgb, var(--md-theme-color) 28%, transparent);
}
.chip.tag {
  color: var(--app-text-dim);
  border: 1px solid var(--app-border);
}
</style>
