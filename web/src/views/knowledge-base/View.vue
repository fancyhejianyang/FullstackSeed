<script setup lang="ts">
import { computed } from 'vue';
import Button from '@/components/Button.vue';
import Dialog from '@/components/Dialog.vue';
import { formatDateTime } from '@/utils/format';
import type { KnowledgeBase } from '@/api/knowledgeBase';

const props = defineProps<{
  row?: KnowledgeBase | null;
  categoryName?: string;
}>();

const visible = defineModel<boolean>('visible', { required: true });
const rowData = computed(() => props.row);

function getContentTypeLabel(value?: KnowledgeBase['contentType']) {
  const map: Record<string, string> = {
    text: '文本',
    pdf: 'PDF',
    word: 'Word',
    file: '文件',
    mixed: '混合',
  };
  return value ? map[value] ?? value : '-';
}
</script>

<template>
  <Dialog v-model="visible" title="查看知识库" width="720px" :show-footer="false">
    <el-descriptions :column="1" border>
      <el-descriptions-item label="名称">
        {{ rowData?.name || '-' }}
      </el-descriptions-item>
      <el-descriptions-item label="所属分类">
        {{ props.categoryName || '-' }}
      </el-descriptions-item>
      <el-descriptions-item label="编码">
        {{ rowData?.code || '-' }}
      </el-descriptions-item>
      <el-descriptions-item label="状态">
        <el-tag :type="rowData?.isEnabled ? 'success' : 'info'">
          {{ rowData?.isEnabled ? '启用' : '停用' }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="内容类型">
        {{ getContentTypeLabel(rowData?.contentType) }}
      </el-descriptions-item>
      <el-descriptions-item v-if="rowData?.contentType === 'text'" label="文本内容">
        <div class="knowledge-base-view__description">
          {{ rowData?.contentText || '-' }}
        </div>
      </el-descriptions-item>
      <el-descriptions-item v-else label="文件">
        <el-link v-if="rowData?.fileUrl" type="primary" :href="rowData.fileUrl" target="_blank">
          {{ rowData.fileName || '下载文件' }}
        </el-link>
        <span v-else>-</span>
      </el-descriptions-item>
      <el-descriptions-item label="创建时间">
        {{ rowData?.createdAt ? formatDateTime(rowData.createdAt) : '-' }}
      </el-descriptions-item>
      <el-descriptions-item label="更新时间">
        {{ rowData?.updatedAt ? formatDateTime(rowData.updatedAt) : '-' }}
      </el-descriptions-item>
    </el-descriptions>

    <template #footer>
      <Button @click="visible = false">关闭</Button>
    </template>
  </Dialog>
</template>

<style scoped>
.knowledge-base-view__description {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
}
</style>
