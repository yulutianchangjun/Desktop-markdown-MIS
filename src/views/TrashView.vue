<script setup lang="ts">
import { confirm } from '@tauri-apps/plugin-dialog';

import AppIcon from '@/components/AppIcon.vue';
import BentoCard from '@/components/BentoCard.vue';
import DocumentList from '@/components/DocumentList.vue';
import { useDocumentsStore } from '@/stores/documents';

const docs = useDocumentsStore();

/** 软删除：从废纸篓还原。 */
async function restore(id: number): Promise<void> {
  await docs.restore(id);
}

/** 彻底删除：不可撤销，先确认。 */
async function purge(id: number, title: string): Promise<void> {
  const ok = await confirm(`确定要彻底删除《${title}》吗？该操作不可撤销。`, {
    title: '彻底删除',
    kind: 'warning',
  });
  if (ok) await docs.remove(id);
}
</script>

<template>
  <BentoCard title="废纸篓 / 归档" icon="trash">
    <template #actions>
      <span class="summary">{{ docs.archived.length }} 篇已归档</span>
    </template>

    <div class="hint empty-hint">
      归档为软删除（<code>is_archived = 1</code>），文档仍保留在 <code>documents</code> 表中，
      可随时还原；只有「彻底删除」才会真正移除记录。
    </div>

    <DocumentList
      :items="docs.archived"
      show-category
      empty-text="废纸篓是空的。"
      @open="docs.openDocument"
    >
      <template #actions="{ row }">
        <button class="mini-btn" title="还原" @click="restore(row.id)">
          <AppIcon name="restore" :size="13" />
        </button>
        <button class="mini-btn danger" title="彻底删除" @click="purge(row.id, row.title)">
          <AppIcon name="close" :size="13" />
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
.hint {
  margin-bottom: 12px;
  padding: 9px 12px;
  border-radius: var(--app-radius-md);
  border: 1px solid var(--app-border);
  background: var(--app-raised);
}
code {
  padding: 1px 4px;
  border-radius: 4px;
  border: 1px solid var(--app-border);
  font-size: 0.74rem;
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
.mini-btn.danger:hover {
  color: #e5544b;
  border-color: rgba(229, 84, 75, 0.5);
}
</style>
