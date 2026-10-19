<script setup lang="ts">
import type { DashboardWidget } from '@/api/dashboard';
import DashboardWidgetCard from './DashboardWidgetCard.vue';
defineProps<{
  widgets: DashboardWidget[];
  preview?: boolean;
  refreshing?: boolean;
}>();
defineEmits<{ retry: [instanceId: string] }>();
</script>
<template>
  <div class="dashboard-container">
    <div class="dashboard-grid">
      <div
        v-for="widget in widgets"
        :key="widget.instanceId"
        class="dashboard-cell"
        :style="{ '--widget-span': widget.layout.span }"
      >
        <DashboardWidgetCard
          :widget="widget"
          :preview="preview"
          :refreshing="refreshing"
          @retry="$emit('retry', $event)"
        />
      </div>
    </div>
  </div>
</template>
<style scoped>
.dashboard-container {
  container-type: inline-size;
  min-width: 0;
}
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 18px;
}
.dashboard-cell {
  grid-column: span var(--widget-span);
  min-width: 0;
}
@container (max-width:1050px) {
  .dashboard-cell {
    grid-column: span 6;
  }
  .dashboard-cell[style*='12'] {
    grid-column: span 12;
  }
}
@container (max-width:720px) {
  .dashboard-cell {
    grid-column: span 12;
  }
}
</style>
