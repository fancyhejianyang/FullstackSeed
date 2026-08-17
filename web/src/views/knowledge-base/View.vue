<script setup lang="ts">
import { computed } from 'vue';
import Button from '@/components/Button.vue';
import Dialog from '@/components/Dialog.vue';
import { formatDateTime } from '@/utils/format';
import type { KnowledgeBase } from '@/api/knowledgeBase';

const props = defineProps<{
  row?: KnowledgeBase | null;
}>();

const visible = defineModel<boolean>('visible', { required: true });
const rowData = computed(() => props.row);

function getContentTypeLabel(value?: KnowledgeBase['contentType']) {
  const map: Record<KnowledgeBase['contentType'], string> = {
    text: '文本',
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
      <el-descriptions-item label="包含图片">
        <el-tag :type="rowData?.containsImages ? 'success' : 'info'">
          {{ rowData?.containsImages ? '包含' : '不含' }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="文件上传">
        <el-tag :type="rowData?.allowFileUpload ? 'success' : 'info'">
          {{ rowData?.allowFileUpload ? '允许' : '不允许' }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="文件类型">
        {{ rowData?.allowedFileTypes || '-' }}
      </el-descriptions-item>
      <el-descriptions-item label="排序">
        {{ rowData?.sort ?? '-' }}
      </el-descriptions-item>
      <el-descriptions-item label="描述">
        <div class="knowledge-base-view__description">
          {{ rowData?.description || '-' }}
        </div>
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
