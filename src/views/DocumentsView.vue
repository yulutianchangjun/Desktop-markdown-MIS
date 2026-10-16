<script setup lang="ts">
import { computed } from 'vue';

import AppIcon from '@/components/AppIcon.vue';
import BentoCard from '@/components/BentoCard.vue';
import DocumentList from '@/components/DocumentList.vue';
import { useDocumentsStore } from '@/stores/documents';

const docs = useDocumentsStore();

const summary = computed(() => {
  const term = docs.search.trim();
  if (term) return `命中 ${docs.filtered.length} 篇 / 共 ${docs.stats.total} 篇`;
  return `共 ${docs.stats.total} 篇文档`;
});
</script>

<template>
  <BentoCard title="全部文档" icon="library">
    <template #actions>
      <span class="summary">{{ summary }}</span>
      <button v-if="docs.search" class="ghost-btn" @click="docs.search = ''">
        <AppIcon name="close" :size="13" />
        清除搜索
      </button>
    </template>

    <DocumentList
      :items="docs.filtered"
      show-category
      :empty-text="
        docs.search ? '没有匹配的文档，换个关键词试试。' : '还没有导入任何 Markdown 文档。'
      "
      @open="docs.openDocument"
    >
      <template #actions="{ row }">
        <button class="mini-btn" title="移入废纸篓" @click="docs.archive(row.id)">
          <AppIcon name="trash" :size="13" />
        </button>
      </template>
    </DocumentList>
  </BentoCard>
</template>

<style scoped>
.summary {
  font-size: 0.74rem;
  color: var(--app-text-dim);
}
.mini-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  color: var(--app-text-dim);
  border: 1px solid var(--app-border);
}
.mini-btn:hover {
  color: var(--md-theme-color);
  border-color: color-mix(in srgb, var(--md-theme-color) 45%, transparent);
}
</style>
