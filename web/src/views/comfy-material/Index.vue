<script setup lang="ts">
import { ref } from "vue";
import { ElMessage } from "element-plus";
import PageContainer from "@/components/PageContainer.vue";
import Table, { type TableColumn } from "@/components/Table.vue";
import Dialog from "@/components/Dialog.vue";
import Button from "@/components/Button.vue";
import Input from "@/components/Input.vue";
import type { FormField } from "@/components/Form.vue";
import { formatDateTime } from "@/utils/format";
import {
  cleanupManagedFiles,
  getManagedCleanupPreview,
} from "@/api/storageConfig";
import {
  batchDeleteComfyMaterials,
  deleteComfyMaterial,
  getComfyMaterials,
  updateComfyMaterial,
  uploadComfyMaterial,
  type ComfyMaterial,
} from "@/api/comfyUi";

const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();
const uploadVisible = ref(false);
const uploading = ref(false);
const fileInput = ref<HTMLInputElement>();
const selectedFile = ref<File | null>(null);
const materialName = ref("");
const cleanupFileIds = ref<number[]>([]);
const cleanupLoading = ref(false);
const columns: TableColumn[] = [
  {
    prop: "fileUrl",
    label: "预览",
    width: 76,
    slot: true,
    showOverflowTooltip: false,
  },
  { prop: "name", label: "素材名称", minWidth: 220 },
  { prop: "sourceType", label: "来源", width: 100, slot: true },
  { prop: "mediaType", label: "类型", width: 90, slot: true },
  { prop: "size", label: "大小", width: 110, slot: true },
  { prop: "sourceTaskId", label: "来源任务", width: 110, slot: true },
  { prop: "createdAt", label: "创建时间", width: 180, slot: true },
];
const searchFields: FormField[] = [
  { prop: "keyword", label: "关键词", type: "input", placeholder: "素材名称" },
  {
    prop: "sourceType",
    label: "来源",
    type: "select",
    options: [
      { label: "全部", value: "" },
      { label: "输入素材", value: "input" },
      { label: "生成结果", value: "output" },
    ],
  },
  {
    prop: "mediaType",
    label: "类型",
    type: "select",
    options: [
      { label: "全部", value: "" },
      { label: "图片", value: "image" },
      { label: "视频", value: "video" },
      { label: "文件", value: "file" },
    ],
  },
];
function openUpload() {
  selectedFile.value = null;
  materialName.value = "";
  uploadVisible.value = true;
}
function chooseFile(event: Event) {
  selectedFile.value = (event.target as HTMLInputElement).files?.[0] || null;
  if (selectedFile.value && !materialName.value)
    materialName.value = selectedFile.value.name;
  (event.target as HTMLInputElement).value = "";
}
async function submitUpload() {
  if (!selectedFile.value) {
    ElMessage.warning("请选择要上传的素材文件");
    return;
  }
  uploading.value = true;
  try {
    await uploadComfyMaterial(selectedFile.value, materialName.value);
    ElMessage.success("素材已上传");
    uploadVisible.value = false;
    await tableRef.value?.refresh();
  } finally {
    uploading.value = false;
  }
}
async function toggleFavorite(row: ComfyMaterial) {
  await updateComfyMaterial(row.id, { isFavorite: !row.isFavorite });
  await tableRef.value?.refresh();
}
async function previewCleanup() {
  cleanupLoading.value = true;
  try {
    const result = await getManagedCleanupPreview("comfyui");
    cleanupFileIds.value = result.fileIds;
    if (!result.count) ElMessage.success("暂无到期且无引用的 ComfyUI 文件");
  } finally {
    cleanupLoading.value = false;
  }
}
async function runCleanup() {
  cleanupLoading.value = true;
  try {
    const result = await cleanupManagedFiles(cleanupFileIds.value, "comfyui");
    ElMessage.success(
      `已清理 ${result.deleted} 个文件${result.failed ? `，${result.failed} 个失败` : ""}`,
    );
    cleanupFileIds.value = [];
  } finally {
    cleanupLoading.value = false;
  }
}
function formatBytes(value: number) {
  const size = Number(value || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
</script>

<template>
  <PageContainer title="素材库管理">
    <Table
      ref="tableRef"
      perm-module="comfyMaterial"
      :columns="columns"
      :search-fields="searchFields"
      :request="getComfyMaterials"
      :delete-request="(row) => deleteComfyMaterial(row.id)"
      :batch-delete-request="
        ({ ids }) => batchDeleteComfyMaterials(ids as number[])
      "
      :check-able="true"
      :show-view="false"
      :show-edit="false"
      action-width="180"
    >
      <template #toolbar>
        <Button perm="ComfyMaterial.create" icon="Upload" @click="openUpload"
          >上传输入素材</Button
        >
        <Button
          perm="ComfyMaterial.batchDelete"
          :confirm="false"
          @click="tableRef?.runBatchDelete()"
          >批量删除</Button
        >
        <Button
          perm="MediaStorage.read"
          :loading="cleanupLoading"
          @click="previewCleanup"
          >检查过期文件</Button
        >
        <Button
          v-if="cleanupFileIds.length"
          perm="MediaStorage.update"
          :loading="cleanupLoading"
          :confirm-text="`确认删除 ${cleanupFileIds.length} 个到期且无引用的 ComfyUI 文件？`"
          @click="runCleanup"
          >执行清理</Button
        >
      </template>
      <template #column-fileUrl="{ row }">
        <a
          v-if="row.fileUrl"
          :href="row.fileUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="preview-link"
        >
          <img
            v-if="row.mediaType === 'image'"
            :src="row.fileUrl"
            :alt="row.name"
          />
          <span v-else>{{ row.mediaType === "video" ? "视频" : "文件" }}</span>
        </a>
        <span v-else>—</span>
      </template>
      <template #column-sourceType="{ row }">
        <el-tag :type="row.sourceType === 'output' ? 'success' : 'info'">{{
          row.sourceType === "output" ? "生成结果" : "输入素材"
        }}</el-tag>
      </template>
      <template #column-mediaType="{ row }">{{
        row.mediaType === "image"
          ? "图片"
          : row.mediaType === "video"
            ? "视频"
            : "文件"
      }}</template>
      <template #column-size="{ row }">{{ formatBytes(row.size) }}</template>
      <template #column-sourceTaskId="{ row }">{{
        row.sourceTaskId ? `#${row.sourceTaskId}` : "—"
      }}</template>
      <template #column-createdAt="{ row }">{{
        formatDateTime(row.createdAt)
      }}</template>
      <template #actions="{ row }">
        <Button
          perm="ComfyMaterial.update"
          link
          :confirm="false"
          @click="toggleFavorite(row)"
        >
          {{ row.isFavorite ? "取消收藏" : "收藏" }}
        </Button>
      </template>
    </Table>

    <Dialog
      v-model="uploadVisible"
      title="上传 ComfyUI 输入素材"
      width="560px"
      confirm-text="上传素材"
      :confirm-loading="uploading"
      @confirm="submitUpload"
    >
      <div class="upload-panel">
        <Input
          v-model="materialName"
          placeholder="素材名称（不填则使用文件名）"
        />
        <button class="file-picker" type="button" @click="fileInput?.click()">
          <span>{{
            selectedFile
              ? selectedFile.name
              : "点击选择图片、视频或工作流需要的文件"
          }}</span>
          <small>单个文件最大 100MB；文件将进入 ComfyUI 独立受管目录</small>
        </button>
        <input ref="fileInput" hidden type="file" @change="chooseFile" />
      </div>
    </Dialog>
  </PageContainer>
</template>

<style scoped>
.preview-link {
  display: inline-flex;
  width: 44px;
  height: 44px;
  border-radius: 6px;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  background: #f2f6fc;
  color: #606266;
  font-size: 12px;
}
.preview-link img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.upload-panel {
  display: grid;
  gap: 16px;
}
.file-picker {
  min-height: 130px;
  border: 1px dashed #b8c4d6;
  border-radius: 10px;
  background: #f8fbff;
  color: #303133;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
}
.file-picker:hover {
  border-color: #409eff;
  background: #f2f8ff;
}
.file-picker small {
  color: #909399;
}
</style>
