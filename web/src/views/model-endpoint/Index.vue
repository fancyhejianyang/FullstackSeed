<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import PageContainer from "@/components/PageContainer.vue";
import Table from "@/components/Table.vue";
import Button from "@/components/Button.vue";
import type { FormField } from "@/components/Form.vue";
import {
  batchDeleteModelEndpoints,
  deleteModelEndpoint,
  getModelEndpointOptions,
  getModelEndpoints,
  importOfficialModelEndpoints,
  type ModelEndpoint,
  type ModelEndpointOptions,
  type QueryModelEndpointParams,
} from "@/api/modelEndpoint";
import { modelPlatformLabels } from "@/utils/modelPlatform";
import { getPermissionActionColor } from "@/utils/permission";
import Edit from "./Edit.vue";
import View from "./View.vue";
import Test from "./Test.vue";

const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();
const source = ref<"builtin" | "configured">("builtin");
function loadEndpoints(params: QueryModelEndpointParams) {
  return getModelEndpoints({ ...params, source: source.value });
}
const options = ref<ModelEndpointOptions>({
  platforms: [],
  functions: [],
  protocols: [],
});
const searchFields = computed<FormField[]>(() => [
  {
    prop: "category",
    label: "类别",
    type: "select",
    options: options.value.categories ?? [],
  },
  {
    prop: "keyword",
    label: source.value === "builtin" ? "规则" : "模型",
    type: "input",
    placeholder:
      source.value === "builtin" ? "平台 / 功能名称" : "模型编码 / 名称",
  },
  {
    prop: "platformType",
    label: "平台",
    type: "select",
    options: options.value.platforms,
  },
  {
    prop: "functionType",
    label: "功能",
    type: "select",
    options: options.value.functions,
  },
  ...(source.value === "configured"
    ? [
        {
          prop: "isActive",
          label: "状态",
          type: "select" as const,
          options: [
            { label: "启用", value: true },
            { label: "停用", value: false },
          ],
        },
      ]
    : []),
]);
const editVisible = ref(false);
const editingRow = ref<ModelEndpoint | null>(null);
const viewVisible = ref(false);
const viewingRow = ref<ModelEndpoint | null>(null);
const testVisible = ref(false);
const testingRow = ref<ModelEndpoint | null>(null);
const importingOfficial = ref(false);
async function importOfficial() {
  if (importingOfficial.value) return;
  importingOfficial.value = true;
  try {
    const result = await importOfficialModelEndpoints();
    const message = `新增 ${result.added} 条接口，保留 ${result.skipped} 条已有配置（含停用或删除记录）。`;
    if (result.added) ElMessage.success(message);
    else ElMessage.info(message);
    await tableRef.value?.refresh();
  } finally {
    importingOfficial.value = false;
  }
}
const label = (items: Array<{ value: string; label: string }>, value: string) =>
  items.find((item) => item.value === value)?.label ?? value;
function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}
function handleEdit(row: ModelEndpoint) {
  if (row.isReadOnly) return;
  editingRow.value = row;
  editVisible.value = true;
}
function handleView(row: ModelEndpoint) {
  viewingRow.value = row;
  viewVisible.value = true;
}
function handleTest(row: ModelEndpoint) {
  testingRow.value = row;
  testVisible.value = true;
}
onMounted(async () => {
  options.value = await getModelEndpointOptions();
});
</script>

<template>
  <PageContainer title="模型厂商调用接口">
    <el-tabs v-model="source">
      <el-tab-pane label="系统通用" name="builtin" />
      <el-tab-pane label="模型专用" name="configured" />
    </el-tabs>
    <el-alert
      class="endpoint-card__scope-hint"
      :title="
        source === 'builtin'
          ? '系统规则只读，按账号功能目录和模型匹配默认调用格式。存在模型专用卡片时优先使用专用配置，停用的专用卡片会阻止调用。热点采集与联网补充由后端策略统一处理，无需配置联网搜索卡片。'
          : '按具体模型和功能设置接口，优先于系统通用规则。历史卡片保留；生图、视频等专用功能必须配置对应接口。'
      "
      type="info"
      :closable="false"
    />
    <Table
      :key="source"
      ref="tableRef"
      :columns="[]"
      :request="loadEndpoints"
      :search-fields="searchFields"
      display-mode="cards"
      :page-sizes="[12, 24, 48]"
      :check-able="source === 'configured'"
      :show-edit="source === 'configured'"
      :show-delete="source === 'configured'"
      perm-module="modelEndpoint"
      :delete-request="(row: ModelEndpoint) => deleteModelEndpoint(row.id)"
      :batch-delete-request="({ ids }) => batchDeleteModelEndpoints(ids)"
      @view="handleView"
      @edit="handleEdit"
    >
      <template #toolbar="{ selectedRows }">
        <Button
          v-if="source === 'configured'"
          perm="ModelEndpoint.create"
          @click="openCreate"
          >新增接口</Button
        >
        <Button
          v-if="source === 'configured'"
          perm="ModelEndpoint.create"
          icon="Download"
          :confirm="false"
          :loading="importingOfficial"
          @click="importOfficial"
          >补充官方接口</Button
        >
        <Button
          v-if="source === 'configured'"
          perm="ModelEndpoint.batchDelete"
          :confirm="false"
          :disabled="!selectedRows.length"
          @click="tableRef?.runBatchDelete()"
          >批量删除</Button
        >
      </template>
      <template #card="{ row }">
        <div class="endpoint-card__heading">
          <span>{{ modelPlatformLabels[row.platformType] }}</span>
          <el-tag
            :type="getPermissionActionColor(row.isActive ? 'create' : 'read')"
            >{{
              row.isReadOnly
                ? "系统内置 · 只读"
                : row.isActive
                  ? "启用"
                  : "停用"
            }}</el-tag
          >
        </div>
        <h3 class="endpoint-card__title">{{ row.modelName }}</h3>
        <div class="endpoint-card__model">
          {{
            row.isReadOnly
              ? "适用模型：账号对应功能目录；无需逐版本配置"
              : row.modelCode
          }}
        </div>
        <div class="endpoint-card__badges">
          <el-tag :type="getPermissionActionColor('read')">{{
            label(options.functions, row.functionType)
          }}</el-tag>
          <el-tag :type="getPermissionActionColor('read')">{{
            row.executionMode === "async" ? "异步任务" : "同步返回"
          }}</el-tag>
        </div>
        <div class="endpoint-card__protocol">
          {{ label(options.protocols, row.protocol) }}
          <el-link
            v-if="row.documentationUrl"
            :href="row.documentationUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="endpoint-card__documentation"
            >官方调用文档</el-link
          >
        </div>
        <div class="endpoint-card__path">
          <span>POST</span><code>{{ row.apiPath }}</code>
        </div>
        <div v-if="row.executionMode === 'async'" class="endpoint-card__path">
          <span>{{ row.taskMethod ?? "GET" }}</span
          ><code>{{ row.taskApiPath }}</code>
        </div>
      </template>
      <template #actions="{ row }">
        <Button
          perm="ModelEndpoint.update"
          link
          icon="Connection"
          :confirm="false"
          @click="handleTest(row)"
          >测试</Button
        >
      </template>
    </Table>
    <Edit
      v-model:visible="editVisible"
      :row="editingRow"
      @success="tableRef?.refresh()"
    />
    <View v-model:visible="viewVisible" :row="viewingRow" :options="options" />
    <Test v-model:visible="testVisible" :row="testingRow" />
  </PageContainer>
</template>

<style scoped lang="scss">
.endpoint-card__scope-hint {
  margin-bottom: 16px;
}
.endpoint-card__heading,
.endpoint-card__badges {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.endpoint-card__heading {
  justify-content: space-between;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.endpoint-card__title {
  margin: 16px 0 6px;
  font-size: 17px;
  color: var(--el-text-color-primary);
  overflow-wrap: anywhere;
}
.endpoint-card__model {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  overflow-wrap: anywhere;
}
.endpoint-card__badges {
  margin: 16px 0 12px;
}
.endpoint-card__protocol {
  font-size: 13px;
  margin-bottom: 12px;
  color: var(--el-text-color-regular);
}
.endpoint-card__documentation {
  margin-left: 12px;
  font-size: 12px;
}
.endpoint-card__path {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
}
.endpoint-card__path span {
  flex: 0 0 36px;
  font-weight: 600;
  color: var(--el-color-primary);
}
.endpoint-card__path code {
  overflow-wrap: anywhere;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
</style>
