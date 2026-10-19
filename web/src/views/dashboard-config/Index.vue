<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Checkbox from '@/components/Checkbox.vue';
import { useUserStore } from '@/stores/user';
import {
  getDashboardConfiguration,
  saveDashboardConfiguration,
  rollbackDashboardConfiguration,
  type DashboardConfiguration,
  type WidgetConfig,
} from '@/api/dashboard';
import DashboardWidgetCard from '@/views/home/components/DashboardWidgetCard.vue';
import { previewWidget } from '@/views/home/dashboardPreview';
import Edit from './Edit.vue';
import View from './View.vue';
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
const canEdit = computed(() => user.hasPermission('DashboardConfig.update'));
const dirty = computed(() => JSON.stringify(widgets.value) !== baseline.value);
const definitions = computed(() => config.value?.definitions ?? []);
const selectedDefinition = computed(() =>
  definitions.value.find((d) => d.key === selected.value?.widgetKey),
);
function apply(value: DashboardConfiguration) {
  config.value = value;
  const known = value.draft.filter((w) =>
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
async function save(publish: boolean) {
  if (!config.value) return;
  busy.value = true;
  try {
    apply(
      await saveDashboardConfiguration(
        config.value.revision,
        widgets.value,
        publish,
      ),
    );
    ElMessage.success(publish ? '首页配置已生效' : '草稿已保存');
  } finally {
    busy.value = false;
  }
}
async function rollback() {
  if (!config.value) return;
  busy.value = true;
  try {
    apply(await rollbackDashboardConfiguration(config.value.revision));
    ElMessage.success('已回退首页版本');
  } finally {
    busy.value = false;
  }
}
function move(index: number, direction: number) {
  const target = index + direction;
  if (target < 0 || target >= widgets.value.length) return;
  const a = widgets.value[index]!;
  widgets.value[index] = widgets.value[target]!;
  widgets.value[target] = a;
  widgets.value.forEach((w, i) => (w.layout.order = i * 10));
}
function update(widget: WidgetConfig) {
  const index = widgets.value.findIndex(
    (w) => w.instanceId === widget.instanceId,
  );
  if (index >= 0) widgets.value[index] = widget;
}
onBeforeRouteLeave(async () => {
  if (!dirty.value) return true;
  try {
    await ElMessageBox.confirm('当前修改尚未保存，确认离开？', '离开首页配置');
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
  void load();
});
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));
</script>
<template>
  <PageContainer title="首页配置">
    <div class="config-header">
      <div>
        <h2>选择首页板块</h2>
        <p>
          已选 {{ widgets.filter((w) => w.enabled).length }} 个 · 已发布 v{{
            config?.publishedVersion ?? 0
          }}
          <span v-if="dirty">· 有未保存修改</span>
        </p>
      </div>
      <div class="config-actions">
        <Button :disabled="loading || !config" @click="previewVisible = true"
          >预览首页</Button
        >
        <Button
          perm="DashboardConfig.update"
          :disabled="busy || !config || loading"
          @click="(_, done) => done(save(false))"
          >保存草稿</Button
        >
        <Button
          perm="DashboardConfig.update"
          :disabled="busy || !config || loading"
          @click="(_, done) => done(save(true))"
          >保存并发布</Button
        >
        <Button
          v-if="config?.canRollback"
          perm="DashboardConfig.update"
          :disabled="busy || loading"
          confirm
          confirm-text="回退到上一个已发布版本？当前草稿将被替换。"
          @click="(_, done) => done(rollback())"
          >回退版本</Button
        >
      </div>
    </div>
    <p class="config-help">
      勾选后保存并发布即可生效。首页会根据访问者权限展示相应数据。
    </p>
    <el-skeleton v-if="loading" :rows="6" animated />
    <div v-else-if="error" class="config-error">
      配置加载失败 <Button @click="load">重试</Button>
    </div>
    <div v-else class="config-grid">
      <article
        v-for="(widget, index) in widgets"
        :key="widget.instanceId"
        class="config-card"
        :class="{ 'config-card--selected': widget.enabled }"
      >
        <div class="card-heading">
          <Checkbox
            v-model="widget.enabled"
            :label="definitions.find((d) => d.key === widget.widgetKey)?.name"
            :disabled="!canEdit || busy"
          /><span>{{ widget.layout.span }} / 12</span>
        </div>
        <div class="static-preview">
          <DashboardWidgetCard
            :widget="previewWidget(widget)"
            preview
            compact
          />
        </div>
        <p class="card-description">
          {{ definitions.find((d) => d.key === widget.widgetKey)?.description }}
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
.card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.card-heading > span {
  font-size: 12px;
  color: #687587;
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
