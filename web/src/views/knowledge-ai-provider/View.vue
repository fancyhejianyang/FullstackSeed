<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Dialog from '@/components/Dialog.vue';
import { formatDateTime } from '@/utils/format';
import {
  getKnowledgeAiProvider,
  type KnowledgeAiProvider,
} from '@/api/knowledgeAiProvider';

const props = defineProps<{
  row?: KnowledgeAiProvider | null;
}>();

const visible = defineModel<boolean>('visible', { required: true });
const loading = ref(false);
const detail = ref<KnowledgeAiProvider | null>(null);
const rowData = computed(() => detail.value);
const isEmbeddingOnlyProvider = computed(() => {
  const data = rowData.value;
  if (!data) return false;
  const defaultChatModels = ['qwen-plus'];
  return (
    getModelLines(data.embeddingModels).length > 0 &&
    getModelLines(data.textModels).length === 0 &&
    getModelLines(data.visionModels).length === 0 &&
    getModelLines(data.models).every((item) => defaultChatModels.includes(item))
  );
});

watch(visible, async (value) => {
  if (!value) {
    detail.value = null;
    return;
  }
  if (!props.row?.id) return;
  loading.value = true;
  try {
    detail.value = await getKnowledgeAiProvider(props.row.id);
  } finally {
    loading.value = false;
  }
});

function getModelLines(value?: string | null) {
  return (value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function shouldShowModelGroup(value?: string | null) {
  return !isEmbeddingOnlyProvider.value && getModelLines(value).length > 0;
}
</script>

<template>
  <Dialog v-model="visible" title="查看大模型账号" width="860px" :show-footer="false">
    <div v-loading="loading">
      <el-descriptions :column="1" border>
        <el-descriptions-item label="名称">
          {{ rowData?.name || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="API 地址">
          {{ rowData?.apiUrl || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="业务空间">
          {{ rowData?.workspaceId || '-' }}
        </el-descriptions-item>
        <el-descriptions-item v-if="!isEmbeddingOnlyProvider" label="Chat API 路径">
          {{ rowData?.chatApiPath || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="密钥">
          <el-tag :type="rowData?.secretKeySet ? 'success' : 'warning'">
            {{ rowData?.secretKeySet ? '已配置' : '未配置' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="rowData?.isEnabled ? 'success' : 'info'">
            {{ rowData?.isEnabled ? '启用' : '停用' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item v-if="shouldShowModelGroup(rowData?.models)" label="模型列表">
          <div class="ai-provider-view__models">
            <el-tag v-for="line in getModelLines(rowData?.models)" :key="line" type="info">
              {{ line }}
            </el-tag>
          </div>
        </el-descriptions-item>
        <el-descriptions-item v-if="shouldShowModelGroup(rowData?.textModels)" label="文本模型">
          <div class="ai-provider-view__models">
            <el-tag v-for="line in getModelLines(rowData?.textModels)" :key="line" type="info">
              {{ line }}
            </el-tag>
          </div>
        </el-descriptions-item>
        <el-descriptions-item v-if="shouldShowModelGroup(rowData?.visionModels)" label="视觉模型">
          <div class="ai-provider-view__models">
            <el-tag v-for="line in getModelLines(rowData?.visionModels)" :key="line" type="info">
              {{ line }}
            </el-tag>
          </div>
        </el-descriptions-item>
        <el-descriptions-item label="向量模型">
          <div
            v-if="getModelLines(rowData?.embeddingModels).length"
            class="ai-provider-view__models"
          >
            <el-tag
              v-for="line in getModelLines(rowData?.embeddingModels)"
              :key="line"
              type="info"
            >
              {{ line }}
            </el-tag>
          </div>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item label="描述">
          {{ rowData?.description || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">
          {{ rowData?.createdAt ? formatDateTime(rowData.createdAt) : '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="更新时间">
          {{ rowData?.updatedAt ? formatDateTime(rowData.updatedAt) : '-' }}
        </el-descriptions-item>
      </el-descriptions>
    </div>
  </Dialog>
</template>

<style scoped>
.ai-provider-view__models {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
