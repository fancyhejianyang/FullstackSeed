<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Checkbox from '@/components/Checkbox.vue';
import { useUserStore } from '@/stores/user';
import {
  getDashboardConfiguration,
  saveDashboardConfiguration,
  type DashboardConfiguration,
  type WidgetConfig,
} from '@/api/dashboard';
import DashboardWidgetCard from '@/views/home/components/DashboardWidgetCard.vue';
import { previewWidget } from '@/views/home/dashboardPreview';
import Edit from './Edit.vue';
import View from './View.vue';
import {
  dropWidget,
  getDropPosition,
  moveWidgetToIndex,
  type DropAxis,
  type DropPosition,
} from './widgetOrder';
const user = useUserStore();
const config = ref<DashboardConfiguration>();
const widgets = ref<WidgetConfig[]>([]);
const baseline = ref('[]');
const busy = ref(false),
  loading = ref(false),
  error = ref(false);
const editVisible = ref(false),
  previewVisible = ref(false),
  selected = ref<WidgetConfig | null>(null);
const canEdit = computed(() =>
  user.hasPermission('DashboardConfig.update'),
);
const canReorder = computed(
  () =>
    canEdit.value &&
    !busy.value &&
    !loading.value &&
    !!config.value &&
    !editVisible.value &&
    !previewVisible.value,
);
const dragSource = ref<string | null>(null);
const dropTarget = ref<string | null>(null);
const dropPosition = ref<DropPosition>('before');
const dropAxis = ref<DropAxis>('horizontal');
const orderMessage = ref('');
const dirty = computed(
  () => JSON.stringify(widgets.value) !== baseline.value,
);
const definitions = computed(() => config.value?.definitions ?? []);
const selectedDefinition = computed(() =>
  definitions.value.find((d) => d.key === selected.value?.widgetKey),
);
function apply(value: DashboardConfiguration) {
  clearDrag();
  orderMessage.value = '';
  config.value = value;
  const known = value.widgets.filter((w) =>
    value.definitions.some((d) => d.key === w.widgetKey),
  );
  widgets.value = [
    ...known,
    ...value.definitions
      .filter((d) => !known.some((w) => w.widgetKey === d.key))
      .map((d, i) => ({
        instanceId: d.key,
        widgetKey: d.key,
        schemaVersion: d.schemaVersion,
        enabled: false,
        title: d.name,
        layout: { order: known.length * 10 + i * 10, span: d.defaultSpan },
        params: Object.fromEntries(
          d.parameters.map((p) => [p.key, p.defaultValue]),
        ),
      })),
  ].sort((a, b) => a.layout.order - b.layout.order);
  baseline.value = JSON.stringify(widgets.value);
}
async function load() {
  loading.value = true;
  error.value = false;
  try {
    apply(await getDashboardConfiguration());
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
async function save() {
  if (!config.value || !canEdit.value || busy.value || loading.value)
    return;
  clearDrag();
  busy.value = true;
  try {
    apply(
      await saveDashboardConfiguration(config.value.revision, widgets.value),
    );
    ElMessage.success('首页配置已保存并生效');
  } finally {
    busy.value = false;
  }
}
function move(index: number, direction: number) {
  if (!canReorder.value) return;
  clearDrag();
  const id = widgets.value[index]?.instanceId;
  applyOrder(
    moveWidgetToIndex(widgets.value, index, index + direction),
    id,
  );
}
function applyOrder(next: WidgetConfig[], id?: string) {
  if (next === widgets.value) return;
  widgets.value = next;
  const index = next.findIndex((widget) => widget.instanceId === id);
  orderMessage.value = `已将“${next[index]?.title ?? '板块'}”移至第 ${index + 1} 位，保存配置后生效。`;
}
function clearDrag() {
  dragSource.value = null;
  dropTarget.value = null;
}
function dragStart(event: DragEvent, id: string) {
  if (!canReorder.value || !event.dataTransfer) {
    event.preventDefault();
    return;
  }
  dragSource.value = id;
  dropTarget.value = null;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', id);
  const card = (event.currentTarget as HTMLElement).closest('.config-card');
  if (card) event.dataTransfer.setDragImage(card, 24, 24);
}
function dragOver(event: DragEvent, id: string) {
  if (!canReorder.value || !dragSource.value) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  if (dragSource.value === id) {
    dropTarget.value = null;
    return;
  }
  const card = event.currentTarget as HTMLElement;
  const children = card.parentElement?.children;
  const first = children?.[0]?.getBoundingClientRect();
  const second = children?.[1]?.getBoundingClientRect();
  dropAxis.value =
    first && second && Math.abs(first.left - second.left) > 1
      ? 'horizontal'
      : 'vertical';
  dropPosition.value = getDropPosition(
    card.getBoundingClientRect(),
    { x: event.clientX, y: event.clientY },
    dropAxis.value,
  );
  dropTarget.value = id;
}
function drop(event: DragEvent, id: string) {
  if (!canReorder.value || !dragSource.value) {
    clearDrag();
    return;
  }
  event.preventDefault();
  // Recalculate from the actual drop point; never accept external drag payloads.
  dragOver(event, id);
  const source = dragSource.value;
  if (dropTarget.value === id) {
    applyOrder(
      dropWidget(widgets.value, source, id, dropPosition.value),
      source,
    );
  }
  clearDrag();
}
function dragLeave(event: DragEvent) {
  const card = event.currentTarget as HTMLElement;
  if (!event.relatedTarget || !card.contains(event.relatedTarget as Node)) {
    dropTarget.value = null;
  }
}
function cancelDrag(event: KeyboardEvent) {
  if (event.key === 'Escape') clearDrag();
}
function update(widget: WidgetConfig) {
  if (!canEdit.value || busy.value || loading.value) return;
  const index = widgets.value.findIndex(
    (w) => w.instanceId === widget.instanceId,
  );
  if (index >= 0) widgets.value[index] = widget;
}
onBeforeRouteLeave(async () => {
  clearDrag();
  if (!dirty.value) return true;
  try {
    await ElMessageBox.confirm(
      '当前修改尚未保存，确认离开？',
      '离开首页配置',
    );
    return true;
  } catch {
    return false;
  }
});
function beforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return;
  event.preventDefault();
  event.returnValue = '';
}
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload);
  window.addEventListener('dragend', clearDrag);
  window.addEventListener('drop', clearDrag);
  window.addEventListener('blur', clearDrag);
  window.addEventListener('keydown', cancelDrag);
  void load();
});
watch(canReorder, (allowed) => {
  if (!allowed) clearDrag();
});
onBeforeUnmount(() => {
  clearDrag();
  window.removeEventListener('beforeunload', beforeUnload);
  window.removeEventListener('dragend', clearDrag);
  window.removeEventListener('drop', clearDrag);
  window.removeEventListener('blur', clearDrag);
  window.removeEventListener('keydown', cancelDrag);
});
</script>
<template>
  <PageContainer title="首页配置">
    <div class="config-header">
      <div>
        <h2>选择首页板块</h2>
        <p>
          已启用 {{ widgets.filter((w) => w.enabled).length }} 个
          <span v-if="dirty">· 有未保存修改</span>
        </p>
      </div>
      <div class="config-actions">
        <Button
          :disabled="loading || !config"
          @click="previewVisible = true"
          >预览首页</Button
        >
        <Button
          perm="DashboardConfig.update"
          :disabled="busy || !config || loading"
          @click="(_, done) => done(save())"
          >保存配置</Button
        >
      </div>
    </div>
    <p class="config-help">
      拖动板块右上角手柄排序，也可使用上移 /
      下移。启用、停用及排序在保存配置后生效，首页按访问者权限展示数据。
    </p>
    <p
      v-if="orderMessage"
      class="order-message"
      role="status"
      aria-live="polite"
    >
      {{ orderMessage }}
    </p>
    <el-skeleton v-if="loading" :rows="6" animated />
    <div v-else-if="error" class="config-error">
      配置加载失败 <Button @click="load">重试</Button>
    </div>
    <div v-else class="config-grid" @dragleave="dragLeave">
      <article
        v-for="(widget, index) in widgets"
        :key="widget.instanceId"
        class="config-card"
        :class="{
          'config-card--selected': widget.enabled,
          'config-card--dragging': dragSource === widget.instanceId,
          [`config-card--drop-${dropAxis}-${dropPosition}`]:
            dropTarget === widget.instanceId,
        }"
        @dragover="dragOver($event, widget.instanceId)"
        @dragleave="dragLeave"
        @drop="drop($event, widget.instanceId)"
      >
        <span
          v-if="dropTarget === widget.instanceId"
          class="drop-label"
          aria-hidden="true"
        >
          {{
            dropPosition === 'before' ? '放到此板块之前' : '放到此板块之后'
          }}
        </span>
        <div class="card-heading">
          <Checkbox
            v-model="widget.enabled"
            :label="
              definitions.find((d) => d.key === widget.widgetKey)?.name
            "
            :disabled="!canEdit || busy"
          />
          <div class="card-heading-tools">
            <span>{{ index + 1 }} · {{ widget.layout.span }} / 12</span>
            <Button
              perm="DashboardConfig.update"
              class="drag-handle"
              size="small"
              icon="Rank"
              :disabled="!canReorder"
              :draggable="canReorder"
              :aria-label="`拖动排序：${widget.title}；也可使用下方上移、下移按钮`"
              title="拖动排序；键盘或触屏可使用下方上移、下移"
              @dragstart="dragStart($event, widget.instanceId)"
              @dragend="clearDrag"
            />
          </div>
        </div>
        <div class="static-preview">
          <DashboardWidgetCard
            :widget="previewWidget(widget)"
            preview
            compact
          />
        </div>
        <p class="card-description">
          {{
            definitions.find((d) => d.key === widget.widgetKey)?.description
          }}
        </p>
        <div class="card-actions">
          <Button
            perm="DashboardConfig.update"
            size="small"
            :disabled="busy"
            @click="
              selected = widget;
              editVisible = true;
            "
            >设置</Button
          ><Button
            perm="DashboardConfig.update"
            size="small"
            :disabled="index === 0 || busy"
            @click="move(index, -1)"
            >上移</Button
          ><Button
            perm="DashboardConfig.update"
            size="small"
            :disabled="index === widgets.length - 1 || busy"
            @click="move(index, 1)"
            >下移</Button
          >
        </div>
      </article>
    </div>
    <Edit
      v-model:visible="editVisible"
      :row="selected"
      :definition="selectedDefinition"
      @success="update"
    />
    <View v-model:visible="previewVisible" :widgets="widgets" />
  </PageContainer>
</template>
<style scoped>
.config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
h2 {
  margin: 0;
  font-size: 20px;
  color: #263445;
}
.config-header p,
.config-help {
  color: #606b7b;
  font-size: 13px;
}
.config-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.config-help {
  margin-bottom: 24px;
}
.config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
  gap: 18px;
}
.config-card {
  position: relative;
  border: 1px solid #dce3ed;
  border-radius: 12px;
  padding: 16px;
  min-width: 0;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.config-card--selected {
  border-color: #409eff;
  box-shadow: 0 0 0 1px #409eff18;
}
.config-card--dragging {
  opacity: 0.45;
}
.config-card[class*='config-card--drop-'] {
  background: #f5faff;
}
.config-card[class*='config-card--drop-']::after {
  content: '';
  position: absolute;
  background: #409eff;
  border-radius: 3px;
  pointer-events: none;
}
.config-card--drop-horizontal-before::after,
.config-card--drop-horizontal-after::after {
  top: 0;
  bottom: 0;
  width: 4px;
}
.config-card--drop-horizontal-before::after {
  left: -11px;
}
.config-card--drop-horizontal-after::after {
  right: -11px;
}
.config-card--drop-vertical-before::after,
.config-card--drop-vertical-after::after {
  left: 0;
  right: 0;
  height: 4px;
}
.config-card--drop-vertical-before::after {
  top: -11px;
}
.config-card--drop-vertical-after::after {
  bottom: -11px;
}
.drop-label {
  position: absolute;
  z-index: 1;
  top: -13px;
  left: 12px;
  padding: 3px 8px;
  color: #fff;
  background: #337ecc;
  border-radius: 4px;
  font-size: 12px;
  pointer-events: none;
}
.order-message {
  color: #526880;
  font-size: 13px;
  margin: -12px 0 20px;
}
.card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.card-heading-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: auto;
}
.card-heading-tools > span {
  font-size: 12px;
  color: #687587;
}
.drag-handle {
  cursor: grab;
}
.drag-handle:active {
  cursor: grabbing;
}
.drag-handle:disabled {
  cursor: not-allowed;
}
.static-preview {
  height: 230px;
  overflow: hidden;
  border-radius: 8px;
  background: #f7f9fc;
}
.card-description {
  font-size: 12px;
  color: #606b7b;
  min-height: 34px;
  line-height: 1.6;
}
.card-actions {
  display: flex;
  gap: 8px;
}
.config-error {
  padding: 30px;
  text-align: center;
}
</style>
