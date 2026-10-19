<script setup lang="ts">
import { computed } from 'vue';
import Dialog from '@/components/Dialog.vue';
import type { WidgetConfig } from '@/api/dashboard';
import DashboardGrid from '@/views/home/components/DashboardGrid.vue';
import { previewWidget } from '@/views/home/dashboardPreview';
const props = defineProps<{ widgets: WidgetConfig[] }>();
const visible = defineModel<boolean>('visible', { required: true });
const preview = computed(() =>
  props.widgets.filter((w) => w.enabled).map(previewWidget),
);
</script>
<template>
  <Dialog
    v-model="visible"
    title="首页布局预览 · 示意数据"
    width="92%"
    :show-footer="false"
    ><DashboardGrid :widgets="preview" preview /><el-empty
      v-if="!preview.length"
      description="请选择要显示的板块"
  /></Dialog>
</template>
