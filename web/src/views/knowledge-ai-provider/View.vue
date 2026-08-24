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
        <el-descriptions-item label="Chat API 路径">
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
        <el-descriptions-item label="模型列表">
          <div v-if="getModelLines(rowData?.models).length" class="ai-provider-view__models">
            <el-tag v-for="line in getModelLines(rowData?.models)" :key="line" type="info">
              {{ line }}
            </el-tag>
          </div>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item label="文本模型">
          <div v-if="getModelLines(rowData?.textModels).length" class="ai-provider-view__models">
            <el-tag v-for="line in getModelLines(rowData?.textModels)" :key="line" type="info">
              {{ line }}
            </el-tag>
          </div>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item label="视觉模型">
          <div v-if="getModelLines(rowData?.visionModels).length" class="ai-provider-view__models">
            <el-tag v-for="line in getModelLines(rowData?.visionModels)" :key="line" type="info">
              {{ line }}
            </el-tag>
          </div>
          <span v-else>-</span>
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
