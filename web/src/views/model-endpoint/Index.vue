<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import PageContainer from "@/components/PageContainer.vue";
import Table from "@/components/Table.vue";
import Button from "@/components/Button.vue";
import type { FormField } from "@/components/Form.vue";
import {
  batchDeleteModelEndpoints,
  deleteModelEndpoint,
  getModelEndpointOptions,
  getModelEndpoints,
  type ModelEndpoint,
  type ModelEndpointOptions,
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
const options = ref<ModelEndpointOptions>({
  platforms: [],
  functions: [],
  protocols: [],
});
const searchFields = computed<FormField[]>(() => [
  {
    prop: "keyword",
    label: "模型",
    type: "input",
    placeholder: "模型编码 / 名称",
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
  {
    prop: "isActive",
    label: "状态",
    type: "select",
    options: [
      { label: "启用", value: true },
      { label: "停用", value: false },
    ],
  },
]);
const editVisible = ref(false);
const editingRow = ref<ModelEndpoint | null>(null);
const viewVisible = ref(false);
const viewingRow = ref<ModelEndpoint | null>(null);
const testVisible = ref(false);
const testingRow = ref<ModelEndpoint | null>(null);
const label = (items: Array<{ value: string; label: string }>, value: string) =>
  items.find((item) => item.value === value)?.label ?? value;
function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}
function handleEdit(row: ModelEndpoint) {
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
    <Table
      ref="tableRef"
      :columns="[]"
      :request="getModelEndpoints"
      :search-fields="searchFields"
      display-mode="cards"
      :page-sizes="[12, 24, 48]"
      check-able
      perm-module="modelEndpoint"
      :delete-request="(row: ModelEndpoint) => deleteModelEndpoint(row.id)"
      :batch-delete-request="({ ids }) => batchDeleteModelEndpoints(ids)"
      @view="handleView"
      @edit="handleEdit"
    >
      <template #toolbar="{ selectedRows }">
        <Button perm="ModelEndpoint.create" @click="openCreate"
          >新增接口</Button
        >
        <Button
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
            >{{ row.isActive ? "启用" : "停用" }}</el-tag
          >
        </div>
        <h3 class="endpoint-card__title">{{ row.modelName }}</h3>
        <div class="endpoint-card__model">{{ row.modelCode }}</div>
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
        </div>
        <div class="endpoint-card__path">
          <span>POST</span><code>{{ row.apiPath }}</code>
        </div>
        <div v-if="row.executionMode === 'async'" class="endpoint-card__path">
          <span>GET</span><code>{{ row.taskApiPath }}</code>
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
