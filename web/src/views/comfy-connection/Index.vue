<script setup lang="ts">
import { ref } from "vue";
import { ElMessage } from "element-plus";
import PageContainer from "@/components/PageContainer.vue";
import Table, { type TableColumn } from "@/components/Table.vue";
import Button from "@/components/Button.vue";
import type { FormField } from "@/components/Form.vue";
import { formatDateTime } from "@/utils/format";
import {
  batchDeleteComfyConnections,
  deleteComfyConnection,
  getComfyConnections,
  testComfyConnection,
  type ComfyConnection,
} from "@/api/comfyUi";
import Edit from "./Edit.vue";

const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();
const editVisible = ref(false);
const editingRow = ref<ComfyConnection | null>(null);
const testingId = ref<number | null>(null);

const columns: TableColumn[] = [
  { prop: "name", label: "配置名称", minWidth: 160 },
  { prop: "baseUrl", label: "服务地址", minWidth: 230 },
  { prop: "authType", label: "认证", width: 100, slot: true },
  { prop: "lastTestStatus", label: "连接状态", width: 110, slot: true },
  { prop: "isEnabled", label: "启用状态", width: 100, slot: true },
  { prop: "updatedAt", label: "更新时间", width: 180, slot: true },
];
const searchFields: FormField[] = [
  { prop: "keyword", label: "关键词", type: "input", placeholder: "配置名称" },
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
];

function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}
function openEdit(row: ComfyConnection) {
  editingRow.value = row;
  editVisible.value = true;
}
async function handleTest(row: ComfyConnection) {
  testingId.value = row.id;
  try {
    await testComfyConnection(row.id);
    ElMessage.success("ComfyUI 连接成功");
    await tableRef.value?.refresh();
  } finally {
    testingId.value = null;
  }
}
function statusText(status: ComfyConnection["lastTestStatus"]) {
  return { untested: "未检测", available: "可用", unavailable: "不可用" }[
    status
  ];
}
</script>

<template>
  <PageContainer title="ComfyUI 服务配置">
    <Table
      ref="tableRef"
      perm-module="comfyConnection"
      :columns="columns"
      :search-fields="searchFields"
      :request="getComfyConnections"
      :delete-request="(row) => deleteComfyConnection(row.id)"
      :batch-delete-request="
        ({ ids }) => batchDeleteComfyConnections(ids as number[])
      "
      :check-able="true"
      :show-view="false"
      action-width="220"
      @edit="openEdit"
    >
      <template #toolbar>
        <Button perm="ComfyConnection.create" icon="Plus" @click="openCreate"
          >新增服务</Button
        >
        <Button
          perm="ComfyConnection.batchDelete"
          :confirm="false"
          @click="tableRef?.runBatchDelete()"
          >批量删除</Button
        >
      </template>
      <template #column-authType="{ row }">
        {{
          row.authType === "none"
            ? "无认证"
            : row.authType === "basic"
              ? "账号密码"
              : "Token"
        }}
      </template>
      <template #column-lastTestStatus="{ row }">
        <el-tag
          :type="
            row.lastTestStatus === 'available'
              ? 'success'
              : row.lastTestStatus === 'unavailable'
                ? 'danger'
                : 'info'
          "
        >
          {{ statusText(row.lastTestStatus) }}
        </el-tag>
      </template>
      <template #column-isEnabled="{ row }">
        <el-tag :type="row.isEnabled ? 'success' : 'info'">{{
          row.isEnabled ? "启用" : "停用"
        }}</el-tag>
        <el-tag v-if="row.isDefault" class="default-tag">默认</el-tag>
      </template>
      <template #column-updatedAt="{ row }">{{
        formatDateTime(row.updatedAt)
      }}</template>
      <template #actions="{ row }">
        <Button
          perm="ComfyConnection.update"
          link
          :confirm="false"
          :loading="testingId === row.id"
          @click="handleTest(row)"
          >测试连接</Button
        >
      </template>
    </Table>
    <Edit
      v-model:visible="editVisible"
      :row="editingRow"
      @success="tableRef?.refresh()"
    />
  </PageContainer>
</template>

<style scoped>
.default-tag {
  margin-left: 6px;
}
</style>
