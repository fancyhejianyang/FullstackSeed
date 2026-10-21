<script setup lang="ts">
import { ref } from "vue";
import PageContainer from "@/components/PageContainer.vue";
import Table, { type TableColumn } from "@/components/Table.vue";
import Button from "@/components/Button.vue";
import type { FormField } from "@/components/Form.vue";
import { formatDateTime } from "@/utils/format";
import {
  batchDeleteComfyWorkflows,
  deleteComfyWorkflow,
  getComfyWorkflows,
  type ComfyWorkflow,
} from "@/api/comfyUi";
import Edit from "./Edit.vue";

const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();
const editVisible = ref(false);
const editingRow = ref<ComfyWorkflow | null>(null);
const columns: TableColumn[] = [
  { prop: "name", label: "工作流模板", minWidth: 180 },
  { prop: "connectionName", label: "执行服务", minWidth: 150 },
  { prop: "outputType", label: "输出类型", width: 100, slot: true },
  { prop: "targetModel", label: "目标模型", minWidth: 160 },
  {
    prop: "visualPromptTemplateId",
    label: "提示词规范",
    width: 120,
    slot: true,
  },
  { prop: "bindingCount", label: "开放参数", width: 100, slot: true },
  { prop: "version", label: "版本", width: 80, slot: true },
  { prop: "isEnabled", label: "使用状态", width: 100, slot: true },
  { prop: "updatedAt", label: "更新时间", width: 180, slot: true },
];
const searchFields: FormField[] = [
  {
    prop: "keyword",
    label: "关键词",
    type: "input",
    placeholder: "名称或说明",
  },
  {
    prop: "outputType",
    label: "输出类型",
    type: "select",
    options: [
      { label: "全部", value: "" },
      { label: "图片", value: "image" },
      { label: "视频", value: "video" },
    ],
  },
];
function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}
function openEdit(row: ComfyWorkflow) {
  editingRow.value = row;
  editVisible.value = true;
}
</script>

<template>
  <PageContainer title="工作流管理">
    <Table
      ref="tableRef"
      perm-module="comfyWorkflow"
      :columns="columns"
      :search-fields="searchFields"
      :request="getComfyWorkflows"
      :delete-request="(row) => deleteComfyWorkflow(row.id)"
      :batch-delete-request="
        ({ ids }) => batchDeleteComfyWorkflows(ids as number[])
      "
      :check-able="true"
      :show-view="false"
      action-width="150"
      @edit="openEdit"
    >
      <template #toolbar>
        <Button perm="ComfyWorkflow.create" icon="Plus" @click="openCreate"
          >导入工作流</Button
        >
        <Button
          perm="ComfyWorkflow.batchDelete"
          :confirm="false"
          @click="tableRef?.runBatchDelete()"
          >批量删除</Button
        >
      </template>
      <template #column-outputType="{ row }">
        <el-tag :type="row.outputType === 'video' ? 'warning' : 'success'">{{
          row.outputType === "video" ? "视频" : "图片"
        }}</el-tag>
      </template>
      <template #column-bindingCount="{ row }"
        >{{ row.bindingCount ?? row.inputBindings.length }} 个</template
      >
      <template #column-visualPromptTemplateId="{ row }">
        <el-tag :type="row.visualPromptTemplateId ? 'success' : 'info'">
          {{ row.visualPromptTemplateId ? "已自动绑定" : "未绑定" }}
        </el-tag>
      </template>
      <template #column-version="{ row }">v{{ row.version }}</template>
      <template #column-isEnabled="{ row }">
        <el-tag :type="row.isEnabled ? 'success' : 'info'">
          {{ row.isEnabled ? "可使用" : "已停用" }}
        </el-tag>
      </template>
      <template #column-updatedAt="{ row }">{{
        formatDateTime(row.updatedAt)
      }}</template>
    </Table>
    <Edit
      v-model:visible="editVisible"
      :row="editingRow"
      @success="tableRef?.refresh()"
    />
  </PageContainer>
</template>
