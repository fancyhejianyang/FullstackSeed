<script setup lang="ts">
import { ref } from "vue";
import PageContainer from "@/components/PageContainer.vue";
import Button from "@/components/Button.vue";
import Table, { type TableColumn } from "@/components/Table.vue";
import type { FormField } from "@/components/Form.vue";
import { formatDateTime } from "@/utils/format";
import {
  batchDeleteAgentApps,
  deleteAgentApp,
  getAgentApps,
  type AgentApp,
  type QueryAgentAppParams,
} from "@/api/agentApp";
import Edit from "./Edit.vue";
import View from "./View.vue";

const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();
const editVisible = ref(false);
const viewVisible = ref(false);
const currentRow = ref<AgentApp | null>(null);

const columns: TableColumn[] = [
  { prop: "name", label: "Agent 名称", minWidth: 160 },
  { prop: "responsibility", label: "职责", minWidth: 240 },
  { prop: "providerName", label: "模型账号", minWidth: 160 },
  { prop: "models", label: "模型列表", minWidth: 240, slot: true },
  { prop: "workflowName", label: "知识增强", minWidth: 180, slot: true },
  { prop: "toolKeys", label: "业务工具", minWidth: 260, slot: true },
  { prop: "accessScope", label: "使用范围", width: 130, slot: true },
  { prop: "writeEnabled", label: "写入", width: 90, slot: true },
  { prop: "isEnabled", label: "状态", width: 90, slot: true },
  { prop: "updatedAt", label: "更新时间", width: 180, slot: true },
];

const searchFields: FormField[] = [
  {
    prop: "isEnabled",
    label: "启用状态",
    type: "select",
    options: [
      { label: "全部", value: "" },
      { label: "启用", value: true },
      { label: "停用", value: false },
    ],
  },
  {
    prop: "keyword",
    label: "关键词",
    type: "input",
    placeholder: "名称/职责/模型账号/工作流",
  },
];

function request(params: Record<string, unknown>) {
  return getAgentApps(params as QueryAgentAppParams);
}
function openCreate() {
  currentRow.value = null;
  editVisible.value = true;
}
function openEdit(row: AgentApp) {
  currentRow.value = row;
  editVisible.value = true;
}
function openView(row: AgentApp) {
  currentRow.value = row;
  viewVisible.value = true;
}
function deleteRequest(row: AgentApp) {
  return deleteAgentApp(row.id);
}
function batchDeleteRequest(payload: { ids: Array<string | number> }) {
  return batchDeleteAgentApps(payload.ids);
}

function toolLabel(key: string) {
  return key === "product.query" ? "产品/SKU 查询" : "受控新增 SKU";
}
</script>

<template>
  <PageContainer title="Agent 应用管理">
    <Table
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="request"
      perm-module="agentApp"
      :check-able="true"
      :delete-request="deleteRequest"
      :batch-delete-request="batchDeleteRequest"
      @view="openView"
      @edit="openEdit"
    >
      <template #toolbar>
        <Button perm="AgentApp.create" @click="openCreate">新增 Agent</Button>
        <Button
          perm="AgentApp.batchDelete"
          :confirm="false"
          @click="tableRef?.runBatchDelete()"
          >批量删除</Button
        >
      </template>
      <template #column-toolKeys="{ row }">
        <template v-if="row.toolKeys.length">
          <el-tag v-for="key in row.toolKeys" :key="key" type="info">{{
            toolLabel(key)
          }}</el-tag>
        </template>
        <span v-else>无</span>
      </template>
      <template #column-workflowName="{ row }">
        <el-tag :type="row.workflowId ? 'success' : 'info'">
          {{ row.workflowName || "纯模型对话" }}
        </el-tag>
      </template>
      <template #column-models="{ row }">
        <el-tag v-for="model in row.models" :key="model" type="info">{{
          model
        }}</el-tag>
      </template>
      <template #column-accessScope="{ row }">
        {{
          row.accessScope === "all"
            ? "全部员工"
            : `指定 ${row.allowedUserIds?.length || 0} 人`
        }}
      </template>
      <template #column-writeEnabled="{ row }">
        <el-tag :type="row.writeEnabled ? 'warning' : 'info'">{{
          row.writeEnabled ? "受控开启" : "关闭"
        }}</el-tag>
      </template>
      <template #column-isEnabled="{ row }">
        <el-tag :type="row.isEnabled ? 'success' : 'info'">{{
          row.isEnabled ? "启用" : "停用"
        }}</el-tag>
      </template>
      <template #column-updatedAt="{ row }">{{
        formatDateTime(row.updatedAt)
      }}</template>
    </Table>
    <Edit
      v-model:visible="editVisible"
      :row="currentRow"
      @success="tableRef?.refresh()"
    />
    <View v-model:visible="viewVisible" :row="currentRow" />
  </PageContainer>
</template>

<style scoped>
.el-tag + .el-tag {
  margin-left: 6px;
}
</style>
