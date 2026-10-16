<script setup lang="ts">
import AppIcon from './AppIcon.vue';

defineProps<{
  title: string;
  icon?: string;
  /** 卡片在 Bento 网格中的跨度 */
  span?: string;
}>();
</script>

<template>
  <section class="bento" :style="span ? { gridArea: span } : undefined">
    <header class="bento-head">
      <AppIcon v-if="icon" :name="icon" :size="14" />
      <h2 class="bento-title">{{ title }}</h2>
      <div class="head-actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="bento-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.head-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
.bento-head :deep(.app-icon) {
  color: var(--app-text-dim);
}
</style>
