<script setup lang="ts">
import { computed, ref } from 'vue';

import AppIcon from '@/components/AppIcon.vue';
import BentoCard from '@/components/BentoCard.vue';
import DocumentList from '@/components/DocumentList.vue';
import { useDocumentsStore, type CategoryNode } from '@/stores/documents';
import { DEFAULT_CATEGORY } from '@/db';

const docs = useDocumentsStore();
const collapsed = ref<Set<string>>(new Set());

function toggle(path: string): void {
  const next = new Set(collapsed.value);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  collapsed.value = next;
}

function isOpen(node: CategoryNode): boolean {
  return !collapsed.value.has(node.path);
}

const activeLabel = computed(() => docs.categoryFilter ?? '全部分类');

/** 「未分类」计数。放在脚本里而不是模板里，避免模板内联表达式对导入常量的类型推断歧义。 */
const uncategorizedCount = computed(
  () => docs.open.filter((d) => (d.category ?? DEFAULT_CATEGORY) === DEFAULT_CATEGORY).length,
);
</script>

<template>
  <div class="split">
    <BentoCard title="分类目录" icon="folder">
      <template #actions>
        <button
          v-if="docs.categoryFilter"
          class="ghost-btn"
          @click="docs.categoryFilter = null"
        >
          全部
        </button>
      </template>

      <div v-if="!docs.categoryTree.length" class="empty-hint">
        还没有分类。导入文档后，在编辑区把「分类」改成 <code>父级/子级</code> 这样的路径即可形成多级目录。
      </div>

      <ul v-else class="tree">
        <li>
          <button
            class="node root"
            :class="{ active: docs.categoryFilter === null }"
            @click="docs.categoryFilter = null"
          >
            <AppIcon name="folder" :size="14" />
            <span class="node-name">全部分类</span>
            <span class="node-count">{{ docs.stats.total }}</span>
          </button>
        </li>
        <li>
          <button
            class="node root"
            :class="{ active: docs.categoryFilter === DEFAULT_CATEGORY }"
            @click="docs.categoryFilter = DEFAULT_CATEGORY"
          >
            <AppIcon name="tag" :size="14" />
            <span class="node-name">{{ DEFAULT_CATEGORY }}</span>
            <span class="node-count">{{ uncategorizedCount }}</span>
          </button>
        </li>
      </ul>

      <ul v-if="docs.categoryTree.length" class="tree">
        <template v-for="node in docs.categoryTree" :key="node.path">
          <li>
            <button
              class="node"
              :class="{ active: docs.categoryFilter === node.path }"
              @click="docs.categoryFilter = node.path"
            >
              <span
                v-if="node.children.length"
                class="twist"
                @click.stop="toggle(node.path)"
              >
                <AppIcon :name="isOpen(node) ? 'chevronDown' : 'chevronRight'" :size="12" />
              </span>
              <span v-else class="twist spacer" />
              <AppIcon name="folder" :size="14" />
              <span class="node-name">{{ node.name }}</span>
              <span class="node-count">{{ node.count }}</span>
            </button>

            <ul v-if="node.children.length && isOpen(node)" class="tree child">
              <li v-for="child in node.children" :key="child.path">
                <button
                  class="node"
                  :class="{ active: docs.categoryFilter === child.path }"
                  @click="docs.categoryFilter = child.path"
                >
                  <span class="twist spacer" />
                  <AppIcon name="folder" :size="13" />
                  <span class="node-name">{{ child.name }}</span>
                  <span class="node-count">{{ child.count }}</span>
                </button>
              </li>
            </ul>
          </li>
        </template>
      </ul>
    </BentoCard>

    <BentoCard :title="activeLabel" icon="library">
      <template #actions>
        <span class="summary">{{ docs.filtered.length }} 篇</span>
      </template>
      <DocumentList
        :items="docs.filtered"
        show-category
        empty-text="该分类下暂无文档。"
        @open="docs.openDocument"
      />
    </BentoCard>
  </div>
</template>

<style scoped>
.split {
  display: grid;
  grid-template-columns: minmax(230px, 300px) minmax(0, 1fr);
  gap: 14px;
  height: 100%;
  min-height: 0;
}

.tree {
  list-style: none;
  margin: 0;
  padding: 0;
}
.tree.child {
  padding-left: 14px;
}

.node {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 7px 9px;
  border-radius: var(--app-radius-sm);
  color: var(--app-text);
  text-align: left;
  transition: background 0.15s ease;
}
.node:hover {
  background: var(--app-surface-hover);
}
.node.active {
  color: var(--md-theme-color);
  background: color-mix(in srgb, var(--md-theme-color) 13%, transparent);
}
.node-name {
  flex: 1;
  min-width: 0;
  font-size: 0.84rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.node-count {
  font-size: 0.7rem;
  color: var(--app-text-dim);
}
.node.active .node-count {
  color: var(--md-theme-color);
}

.twist {
  width: 14px;
  display: grid;
  place-items: center;
  color: var(--app-text-dim);
  flex: none;
}
.twist.spacer {
  visibility: hidden;
}

.summary {
  font-size: 0.74rem;
  color: var(--app-text-dim);
}
code {
  font-size: 0.76rem;
  padding: 1px 4px;
  border-radius: 4px;
  border: 1px solid var(--app-border);
}
</style>
