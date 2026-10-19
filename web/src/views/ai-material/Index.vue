<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { ElMessage } from "element-plus";
import PageContainer from "@/components/PageContainer.vue";
import Table, { type TableColumn } from "@/components/Table.vue";
import Button from "@/components/Button.vue";
import type { FormField } from "@/components/Form.vue";
import { formatDateTime } from "@/utils/format";
import {
  batchDeleteAiMaterials,
  deleteAiMaterial,
  generateAiMaterial,
  getAiMaterials,
  type AiMaterialStatus,
  type AiMaterialSummary,
} from "@/api/aiMaterial";
import Edit from "./Edit.vue";
import View from "./View.vue";

const tableRef = ref<{
  refresh: () => Promise<void>;
  clearSelection: () => void;
  runBatchDelete: () => Promise<void>;
}>();
const columns: TableColumn[] = [
  {
    prop: "currentImageUrl",
    label: "图片",
    width: 76,
    slot: true,
    showOverflowTooltip: false,
  },
  { prop: "promptPreview", label: "提示词", minWidth: 280 },
  { prop: "styleKey", label: "风格", width: 120, slot: true },
  { prop: "generationStatus", label: "状态", width: 110, slot: true },
  { prop: "aiConfigName", label: "生图配置", minWidth: 180 },
  { prop: "updatedAt", label: "更新时间", width: 180, slot: true },
];
const searchFields: FormField[] = [
  {
    prop: "keyword",
    label: "提示词",
    type: "input",
    placeholder: "搜索提示词",
  },
  {
    prop: "status",
    label: "状态",
    type: "select",
    options: [
      { label: "待生成", value: "idle" },
      { label: "排队中", value: "pending" },
      { label: "生成中", value: "running" },
      { label: "保存中", value: "storing" },
      { label: "生成完成", value: "succeeded" },
      { label: "失败", value: "failed" },
      { label: "已中断", value: "interrupted" },
    ],
  },
];
const styleLabels: Record<string, string> = {
  original: "原始描述",
  photorealistic: "写实摄影",
  watercolor: "水彩",
  flatIllustration: "扁平插画",
  cinematic: "电影质感",
  custom: "自定义风格",
};
const statusLabels: Record<AiMaterialStatus, string> = {
  idle: "待生成",
  pending: "排队中",
  running: "生成中",
  storing: "保存中",
  succeeded: "生成完成",
  failed: "失败",
  interrupted: "已中断",
};
const activeStatuses: AiMaterialStatus[] = ["pending", "running", "storing"];
let timer: ReturnType<typeof setTimeout> | undefined;
let alive = true;

async function fetchList(params: Record<string, unknown>) {
  clearTimeout(timer);
  const result = await getAiMaterials(params);
  if (
    alive &&
    result.list.some((row) => activeStatuses.includes(row.generationStatus))
  ) {
    timer = setTimeout(
      () => void tableRef.value?.refresh().catch(() => undefined),
      3000,
    );
  }
  return result;
}
onBeforeUnmount(() => {
  alive = false;
  clearTimeout(timer);
});

const editVisible = ref(false);
const viewVisible = ref(false);
const editingRow = ref<AiMaterialSummary | null>(null);
const viewingRow = ref<AiMaterialSummary | null>(null);
const generatingId = ref<number | null>(null);

function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}
function openEdit(row: AiMaterialSummary) {
  editingRow.value = row;
  editVisible.value = true;
}
function openView(row: AiMaterialSummary) {
  viewingRow.value = row;
  viewVisible.value = true;
}
function canGenerate(row?: AiMaterialSummary) {
  return (
    !!row &&
    generatingId.value === null &&
    !activeStatuses.includes(row.generationStatus)
  );
}
async function generate(row: AiMaterialSummary) {
  if (!canGenerate(row)) return;
  generatingId.value = row.id;
  try {
    await generateAiMaterial(row.id, row.version, crypto.randomUUID());
    ElMessage.success("已提交后台生成；旧图会保留到新图保存成功");
    tableRef.value?.clearSelection();
    await tableRef.value?.refresh();
  } finally {
    generatingId.value = null;
  }
}
function statusType(status: AiMaterialStatus) {
  if (status === "succeeded") return "success";
  if (status === "failed" || status === "interrupted") return "danger";
  return "info";
}

function statusLabel(status: unknown) {
  return statusLabels[status as AiMaterialStatus] ?? String(status || "-");
}
</script>

<template>
  <PageContainer title="素材管理">
    <Table
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchList"
      :check-able="true"
      :delete-request="(row) => deleteAiMaterial(row.id)"
      :batch-delete-request="({ ids }) => batchDeleteAiMaterials(ids)"
      perm-module="aiMaterial"
      :action-width="250"
      @view="openView"
      @edit="openEdit"
    >
      <template #toolbar="{ selectedRows }">
        <Button perm="AiMaterial.create" @click="openCreate">新增素材</Button>
        <Button
          perm="AiMaterial.update"
          icon="MagicStick"
          :disabled="selectedRows.length !== 1 || !canGenerate(selectedRows[0])"
          :loading="generatingId !== null"
          title="生成会调用所选图片模型，可能计费且失败后不自动重试"
          @click="generate(selectedRows[0])"
        >
          AI 生成
        </Button>
        <Button
          perm="AiMaterial.batchDelete"
          :confirm="false"
          @click="tableRef?.runBatchDelete()"
        >
          批量删除
        </Button>
      </template>
      <template #actions="{ row }">
        <Button
          perm="AiMaterial.update"
          link
          :auto-icon="false"
          :disabled="!canGenerate(row)"
          :loading="generatingId === row.id"
          @click="generate(row)"
        >
          {{ row.currentImageUrl ? "重新生成" : "AI 生成" }}
        </Button>
      </template>
      <template #column-currentImageUrl="{ row }">
        <el-image
          v-if="row.currentImageUrl"
          class="material-thumb"
          :src="row.currentImageUrl"
          :preview-src-list="[row.currentImageUrl]"
          fit="cover"
          preview-teleported
        >
          <template #error
            ><span class="material-thumb__empty">—</span></template
          >
        </el-image>
        <span v-else>—</span>
      </template>
      <template #column-styleKey="{ row }">{{
        styleLabels[row.styleKey] || row.styleKey
      }}</template>
      <template #column-generationStatus="{ row }">
        <el-tooltip v-if="row.generationError" :content="row.generationError">
          <el-tag :type="statusType(row.generationStatus)">{{
            statusLabel(row.generationStatus)
          }}</el-tag>
        </el-tooltip>
        <el-tag v-else :type="statusType(row.generationStatus)">{{
          statusLabel(row.generationStatus)
        }}</el-tag>
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
    <View v-model:visible="viewVisible" :row="viewingRow" />
  </PageContainer>
</template>

<style scoped>
.material-thumb,
.material-thumb__empty {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 4px;
  background: #f0f2f5;
}
</style>
