<script setup lang="ts">
import { ref } from "vue";
import { ElMessage } from "element-plus";
import PageContainer from "@/components/PageContainer.vue";
import Table, { type TableColumn } from "@/components/Table.vue";
import Button from "@/components/Button.vue";
import type { FormField } from "@/components/Form.vue";
import { formatDateTime } from "@/utils/format";
import {
  cleanupManagedFiles,
  getManagedCleanupPreview,
} from "@/api/storageConfig";
import {
  batchDeleteComfyMaterials,
  deleteComfyMaterialGroup,
  getComfyMaterials,
  updateComfyMaterialGroupFavorite,
  type ComfyMaterialListItem,
} from "@/api/comfyUi";

const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();
const cleanupFileIds = ref<number[]>([]);
const cleanupLoading = ref(false);
const columns: TableColumn[] = [
  {
    prop: "fileUrl",
    label: "预览",
    minWidth: 230,
    slot: true,
    showOverflowTooltip: false,
  },
  { prop: "name", label: "素材名称", minWidth: 220, slot: true },
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
async function removeGroup(row: ComfyMaterialListItem) {
  await deleteComfyMaterialGroup(row.materialIds);
  ElMessage.success(`已删除 ${row.itemCount} 个素材`);
  await tableRef.value?.refresh();
}
async function toggleFavorite(row: ComfyMaterialListItem) {
  await updateComfyMaterialGroupFavorite(row.materialIds, !row.isFavorite);
  await tableRef.value?.refresh();
}
function imagePreviewUrls(row: ComfyMaterialListItem) {
  return row.items
    .filter((item) => item.mediaType === "image" && item.fileUrl)
    .map((item) => item.fileUrl as string);
}
function videoPreviewUrl(fileUrl: string) {
  return fileUrl.includes("#") ? fileUrl : `${fileUrl}#t=0.1`;
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
      :show-delete="false"
      :batch-delete-request="
        ({ rows }) =>
          batchDeleteComfyMaterials(rows.flatMap((row) => row.materialIds))
      "
      :check-able="true"
      :show-view="false"
      :show-edit="false"
      action-width="180"
    >
      <template #toolbar>
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
        <div class="preview-group">
          <template v-for="item in row.items.slice(0, 4)" :key="item.id">
            <el-image
              v-if="item.fileUrl && item.mediaType === 'image'"
              class="preview-image"
              :src="item.fileUrl"
              :alt="item.name"
              :preview-src-list="imagePreviewUrls(row)"
              :initial-index="
                imagePreviewUrls(row).findIndex((url) => url === item.fileUrl)
              "
              :close-on-press-escape="true"
              :infinite="false"
              fit="cover"
              hide-on-click-modal
              preview-teleported
            >
              <template #error>
                <span class="preview-image__empty">—</span>
              </template>
            </el-image>
            <a
              v-else-if="item.fileUrl && item.mediaType === 'video'"
              :href="item.fileUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="preview-video-link"
              title="打开视频"
              :aria-label="`打开视频 ${item.name}`"
            >
              <video
                class="preview-video"
                :src="videoPreviewUrl(item.fileUrl)"
                preload="metadata"
                muted
                playsinline
                aria-hidden="true"
              />
              <span class="preview-video-link__icon" aria-hidden="true">
                <el-icon><VideoPlay /></el-icon>
              </span>
            </a>
            <a
              v-else-if="item.fileUrl"
              :href="item.fileUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="preview-link"
              title="打开文件"
              :aria-label="`打开文件 ${item.name}`"
            >
              <el-icon><Document /></el-icon>
            </a>
            <span v-else class="preview-link" aria-hidden="true">
              <el-icon>
                <VideoPlay v-if="item.mediaType === 'video'" />
                <Document v-else />
              </el-icon>
            </span>
          </template>
          <span v-if="row.itemCount > 4" class="preview-more">
            +{{ row.itemCount - 4 }}
          </span>
        </div>
      </template>
      <template #column-name="{ row }">
        <div class="material-name">
          <span>{{ row.name }}</span>
          <el-tag v-if="row.itemCount > 1" type="info" size="small">
            {{ row.itemCount }} 个
          </el-tag>
        </div>
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
            : row.mediaType === "mixed"
              ? "混合"
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
          perm="ComfyMaterial.delete"
          link
          confirm
          :confirm-text="`确认删除该组的 ${row.itemCount} 个素材？删除后文件将在保留期结束后清理。`"
          @click="(_event, done) => done(removeGroup(row))"
        >
          删除
        </Button>
        <Button
          perm="ComfyMaterial.update"
          link
          :confirm="false"
          @click="(_event, done) => done(toggleFavorite(row))"
        >
          {{ row.isFavorite ? "取消收藏" : "收藏" }}
        </Button>
      </template>
    </Table>
  </PageContainer>
</template>

<style scoped>
.preview-image,
.preview-link,
.preview-video-link {
  display: inline-flex;
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 6px;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  background: #f2f6fc;
  color: #606266;
  font-size: 18px;
  text-decoration: none;
}

.preview-group {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
}

.preview-more {
  display: inline-flex;
  min-width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: var(--color-bg-page);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.material-name {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-sm);
}

.material-name > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-image {
  cursor: zoom-in;
}

.preview-image :deep(.el-image__inner) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-image__empty {
  display: inline-flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
}

.preview-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

.preview-video-link__icon {
  display: inline-flex;
  position: absolute;
  inset: 0;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 24%);
  color: #fff;
  font-size: 22px;
  text-shadow: 0 1px 3px rgb(0 0 0 / 55%);
}
</style>
