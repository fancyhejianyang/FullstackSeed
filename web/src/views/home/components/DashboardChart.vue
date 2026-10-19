<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { init, use, type ECharts } from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { WidgetData } from '@/api/dashboard';
import { dashboardChart } from '../dashboardChart';
use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
  CanvasRenderer,
]);
const props = defineProps<{
  widgetKey: string;
  data: WidgetData;
  compact?: boolean;
}>();
const element = ref<HTMLElement>();
let chart: ECharts | undefined;
let observer: ResizeObserver | undefined;
const option = computed(() => dashboardChart(props.widgetKey, props.data));
function draw() {
  chart?.setOption(
    {
      ...option.value,
      animation:
        !props.compact &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    },
    true,
  );
}
onMounted(() => {
  if (!element.value) return;
  observer = new ResizeObserver(() => {
    if (!element.value?.clientWidth) return;
    if (!chart) {
      chart = init(element.value);
      draw();
    } else chart.resize();
  });
  observer.observe(element.value);
});
watch(option, draw, { deep: true });
onBeforeUnmount(() => {
  observer?.disconnect();
  chart?.dispose();
  chart = undefined;
});
</script>
<template>
  <div
    ref="element"
    class="dashboard-chart"
    :class="{ 'dashboard-chart--compact': compact }"
  />
</template>
<style scoped>
.dashboard-chart {
  height: 300px;
  width: 100%;
  min-width: 0;
}
.dashboard-chart--compact {
  height: 180px;
}
</style>
