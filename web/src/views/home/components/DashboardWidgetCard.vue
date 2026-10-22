<script setup lang="ts">
import { computed, defineAsyncComponent, reactive } from 'vue';
import { useRouter } from 'vue-router';
import Button from '@/components/Button.vue';
import type { DashboardWidget } from '@/api/dashboard';
const DashboardChart = defineAsyncComponent(
  () => import('./DashboardChart.vue'),
);
const props = defineProps<{
  widget: DashboardWidget;
  preview?: boolean;
  compact?: boolean;
  refreshing?: boolean;
}>();
defineEmits<{ retry: [instanceId: string] }>();
const router = useRouter();
const data = computed(() => props.widget.data);
const failedThumbnails = reactive<Record<string, boolean>>({});
const chartEmpty = computed(
  () =>
    !data.value?.series?.some((s) =>
      s.values.some((v) => typeof v === 'number' && v > 0),
    ),
);
function go(path?: string) {
  if (path && !props.preview) void router.push(path);
}
function format(value: number | null) {
  return value === null
    ? '--'
    : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(
        value,
      );
}
</script>
<template>
  <article
    class="widget-card"
    :class="{
      'widget-card--compact': compact,
      'widget-card--core': widget.widgetKey === 'core.metrics',
    }"
  >
    <header>
      <h3>{{ widget.title }}</h3>
      <span v-if="preview" class="preview-badge">示意数据</span
      ><span v-else-if="refreshing" class="subtle">刷新中…</span>
    </header>
    <div v-if="widget.status === 'unavailable'" class="widget-empty">
      <p>数据暂不可用</p>
      <Button size="small" @click="$emit('retry', widget.instanceId)"
        >重试</Button
      >
    </div>
    <div v-else-if="data" class="widget-body">
      <div
        v-if="data.metrics?.length && !(compact && data.series)"
        class="metrics"
        :class="{ 'metrics--core': widget.widgetKey === 'core.metrics' }"
      >
        <div v-for="metric in data.metrics" :key="metric.key" class="metric">
          <span>{{ metric.label }}</span>
          <Button
            v-if="metric.path && !preview"
            text
            class="metric-link"
            @click="go(metric.path)"
            >{{ format(metric.value) }}<small>{{ metric.unit }}</small></Button
          >
          <strong v-else
            >{{ format(metric.value) }}<small>{{ metric.unit }}</small></strong
          >
        </div>
      </div>
      <template v-if="data.series">
        <div v-if="chartEmpty" class="widget-empty">当前范围暂无统计数据</div>
        <DashboardChart
          v-else
          :widget-key="widget.widgetKey"
          :data="data"
          :compact="compact"
        />
      </template>
      <div
        v-if="data.items"
        :class="
          widget.widgetKey === 'quick.actions' ? 'quick-grid' : 'item-list'
        "
      >
        <div
          v-for="item in data.items"
          :key="item.id"
          class="list-item"
          :class="{
            'list-item--creation': widget.widgetKey === 'creation.recent',
            'list-item--inline': widget.widgetKey === 'activity.recent',
          }"
        >
          <div
            v-if="widget.widgetKey === 'creation.recent'"
            class="creation-thumbnail"
            :class="`creation-thumbnail--${item.mediaType ?? 'article'}`"
          >
            <img
              v-if="item.thumbnailUrl && !failedThumbnails[item.id]"
              :src="item.thumbnailUrl"
              alt=""
              @error="failedThumbnails[item.id] = true"
            />
            <span v-else>{{
              item.mediaType === 'video'
                ? '视'
                : item.mediaType === 'image'
                  ? '图'
                  : '文'
            }}</span>
          </div>
          <div>
            <b>{{ item.title }}</b>
            <p>{{ item.detail }}</p>
            <time v-if="item.time">{{
              new Date(item.time).toLocaleString('zh-CN', {
                timeZone: 'Asia/Shanghai',
                hour12: false,
              })
            }}</time>
          </div>
          <Button v-if="item.path && !preview" link @click="go(item.path)"
            >进入</Button
          >
        </div>
        <div v-if="!data.items.length" class="widget-empty">
          {{
            widget.widgetKey === 'operations.todo'
              ? '暂无待办或异常'
              : '暂无记录'
          }}
        </div>
      </div>
      <p v-if="data.note && !compact" class="widget-note">{{ data.note }}</p>
    </div>
  </article>
</template>
<style scoped>
.widget-card {
  background: #fff;
  border: 1px solid #dce3ed;
  border-radius: 14px;
  padding: 20px;
  min-width: 0;
  box-sizing: border-box;
  box-shadow: 0 3px 14px #26344505;
  height: 420px;
  display: flex;
  flex-direction: column;
}
.widget-card--core {
  height: auto;
}
.widget-card--compact {
  height: auto;
}
header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 18px;
}
.widget-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.widget-body::-webkit-scrollbar {
  width: 6px;
}
.widget-body::-webkit-scrollbar-thumb {
  background: #d4dbe6;
  border-radius: 3px;
}
.widget-card:not(.widget-card--compact) .widget-body > :deep(.dashboard-chart) {
  flex: 1 1 auto;
  height: auto;
  min-height: 200px;
}
.widget-card > .widget-empty {
  flex: 1;
  display: grid;
  place-content: center;
}
h3 {
  font-size: 15px;
  font-weight: 650;
  color: #263445;
  margin: 0;
}
h3::before {
  content: '';
  display: inline-block;
  width: 3px;
  height: 13px;
  border-radius: 2px;
  background: #409eff;
  margin-right: 8px;
  vertical-align: -1.5px;
}
.preview-badge {
  background: #edf3fb;
  color: #526880;
  padding: 3px 7px;
  border-radius: 5px;
  font-size: 11px;
}
.subtle {
  font-size: 12px;
  color: #606266;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 18px;
  margin-bottom: 12px;
}
.metrics--core {
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
}
.metric {
  min-width: 0;
}
.metric > span {
  display: block;
  font-size: 13px;
  color: #606b7b;
  margin-bottom: 7px;
}
.metric strong,
.metric-link {
  font-size: 27px;
  font-weight: 650;
  color: #263445;
  padding: 0;
  height: auto;
  line-height: 1.3;
}
.metric-link {
  color: #409eff;
}
.metric small {
  font-weight: 400;
  font-size: 12px;
  margin-left: 5px;
  color: #606266;
}
.widget-note {
  font-size: 12px;
  color: #687587;
  line-height: 1.7;
  border-top: 1px solid #edf0f5;
  padding-top: 12px;
  margin: 12px 0 0;
}
.widget-empty {
  color: #687587;
  text-align: center;
  padding: 42px 8px;
  font-size: 13px;
}
.list-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #edf0f5;
}
.list-item:last-child {
  border-bottom: 0;
}
.list-item > div {
  min-width: 0;
}
.list-item--creation {
  align-items: center;
}
.list-item--creation > div:nth-child(2) {
  flex: 1;
}
.creation-thumbnail {
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  border-radius: 8px;
  overflow: hidden;
  display: grid;
  place-items: center;
  color: #526880;
  background: #edf3fb;
  font-size: 13px;
}
.creation-thumbnail--image {
  color: #287c45;
  background: #edf8f0;
}
.creation-thumbnail--video {
  color: #8a6116;
  background: #fff6e6;
}
.creation-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.list-item b {
  display: block;
  font-size: 13px;
  color: #303e50;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.list-item p,
.list-item time {
  font-size: 12px;
  color: #687587;
  margin: 5px 0 0;
}
.list-item time {
  color: #94a3b8;
}
.list-item--inline {
  padding: 10px 0;
}
.list-item--inline > div {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex: 1;
  min-width: 0;
}
.list-item--inline b {
  flex: 0 1 auto;
  min-width: 0;
}
.list-item--inline p {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
}
.list-item--inline time {
  flex: 0 0 auto;
  margin: 0;
}
.quick-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.quick-grid .list-item {
  padding: 12px;
  background: #f5f8fc;
  border-radius: 8px;
  border: 0;
}
.widget-card--compact {
  padding: 12px;
  box-shadow: none;
  border: 0;
  background: #f7f9fc;
  pointer-events: none;
}
.widget-card--compact header {
  margin-bottom: 10px;
}
.widget-card--compact .metrics {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.widget-card--compact .metric strong {
  font-size: 18px;
}
.widget-card--compact .metric > span {
  font-size: 10px;
}
</style>
