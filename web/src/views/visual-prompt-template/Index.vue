<script setup lang="ts">
import { ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import PageContainer from "@/components/PageContainer.vue";
import Button from "@/components/Button.vue";
import Table, { type TableColumn } from "@/components/Table.vue";
import type { FormField } from "@/components/Form.vue";
import { formatDateTime } from "@/utils/format";
import {
  batchDeleteVisualPromptTemplates,
  deleteVisualPromptTemplate,
  extractVisualPromptTemplate,
  getVisualPromptTemplates,
  type VisualPromptTemplateSummary,
} from "@/api/visualPromptTemplate";
import Edit from "./Edit.vue";
import View from "./View.vue";

const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();
const editVisible = ref(false);
const viewVisible = ref(false);
const editingRow = ref<VisualPromptTemplateSummary | null>(null);
const viewingRow = ref<VisualPromptTemplateSummary | null>(null);
const extractingId = ref<number | null>(null);
const columns: TableColumn[] = [
  { prop: "name", label: "模板名称", minWidth: 180 },
  { prop: "mediaType", label: "媒体", width: 90, slot: true },
  { prop: "targetModel", label: "适用模型", minWidth: 170 },
  { prop: "styleSummary", label: "风格摘要", minWidth: 220 },
  { prop: "aiConfigName", label: "提炼配置", minWidth: 150 },
  { prop: "version", label: "版本", width: 80, slot: true },
  { prop: "isEnabled", label: "状态", width: 90, slot: true },
  { prop: "updatedAt", label: "更新时间", width: 180, slot: true },
];
const searchFields: FormField[] = [
  {
    prop: "keyword",
    label: "关键词",
    type: "input",
    placeholder: "名称、模型或风格",
  },
  {
    prop: "mediaType",
    label: "媒体类型",
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
function openEdit(row: VisualPromptTemplateSummary) {
  editingRow.value = row;
  editVisible.value = true;
}
function openView(row: VisualPromptTemplateSummary) {
  viewingRow.value = row;
  viewVisible.value = true;
}
async function extract(row: VisualPromptTemplateSummary) {
  try {
    await ElMessageBox.confirm(
      "AI 将根据示例、负面示例和目标模型重新提炼模板，成功后覆盖当前提炼结果。是否继续？",
      "AI 提炼视觉提示词",
      { type: "warning" },
    );
  } catch {
    return;
  }
  extractingId.value = row.id;
  try {
    await extractVisualPromptTemplate(row.id);
    ElMessage.success("模型规则与正负提示词模板已更新");
    await tableRef.value?.refresh();
  } finally {
    extractingId.value = null;
  }
}
</script>

<template>
  <PageContainer title="视觉提示词">
    <Table
      ref="tableRef"
      perm-module="visualPromptTemplate"
      :columns="columns"
      :search-fields="searchFields"
      :request="getVisualPromptTemplates"
      :delete-request="(row) => deleteVisualPromptTemplate(row.id)"
      :batch-delete-request="({ ids }) => batchDeleteVisualPromptTemplates(ids)"
      :check-able="true"
      action-width="260"
      @view="openView"
      @edit="openEdit"
    >
      <template #toolbar>
        <Button
          perm="VisualPromptTemplate.create"
          icon="Plus"
          @click="openCreate"
          >新增模板</Button
        >
        <Button
          perm="VisualPromptTemplate.batchDelete"
          :confirm="false"
          @click="tableRef?.runBatchDelete()"
          >批量删除</Button
        >
      </template>
      <template #actions="{ row }">
        <Button
          perm="VisualPromptTemplate.update"
          link
          :confirm="false"
          :loading="extractingId === row.id"
          @click="extract(row)"
          >AI 提炼</Button
        >
      </template>
      <template #column-mediaType="{ row }">
        <el-tag :type="row.mediaType === 'video' ? 'warning' : 'success'">{{
          row.mediaType === "video" ? "视频" : "图片"
        }}</el-tag>
      </template>
      <template #column-version="{ row }">v{{ row.version }}</template>
      <template #column-isEnabled="{ row }"
        ><el-tag :type="row.isEnabled ? 'success' : 'info'">{{
          row.isEnabled ? "启用" : "停用"
        }}</el-tag></template
      >
      <template #column-updatedAt="{ row }">{{
        formatDateTime(row.updatedAt)
      }}</template>
    </Table>
    <Edit
      v-model:visible="editVisible"
      :row="editingRow"
      @success="tableRef?.refresh()"
    />
    <View v-model:visible="viewVisible" :row="viewingRow" />
  </PageContainer>
</template>
