<script setup lang="ts">
import { computed, ref } from 'vue';
import ProDialog from '@/components/ProDialog.vue';
import { formatDateTime } from '@/utils/format';
import type { Article } from '@/api/article';
import { DicService } from '@/dic/service';
import { ARTICLE_CATEGORY, ARTICLE_STATUS } from '@/dic';

const props = defineProps<{
  row?: Article | null;
}>();

const visible = defineModel<boolean>('visible', { required: true });

const rowData = computed(() => props.row ?? null);

const categoryDic = ref<{ label: string; value: string }[]>([]);
const statusDic = ref<{ label: string; value: string }[]>([]);
DicService.init(ARTICLE_CATEGORY, categoryDic);
DicService.init(ARTICLE_STATUS, statusDic);

function getCategoryLabel(value?: string) {
  if (!value) return '-';
  return categoryDic.value.find((item) => item.value === value)?.label ?? value;
}

function getStatusLabel(value?: string) {
  if (!value) return '-';
  return statusDic.value.find((item) => item.value === value)?.label ?? value;
}

const statusTagType = computed(() => (rowData.value?.status === 'published' ? 'success' : 'info'));
</script>

<template>
  <ProDialog v-model="visible" title="查看文章" :show-footer="false">
    <el-descriptions :column="1" border>
      <el-descriptions-item label="标题">
        {{ rowData?.title || '-' }}
      </el-descriptions-item>

      <el-descriptions-item label="分类">
        {{ getCategoryLabel(rowData?.category) }}
      </el-descriptions-item>

      <el-descriptions-item label="状态">
        <el-tag :type="statusTagType">{{ getStatusLabel(rowData?.status) }}</el-tag>
      </el-descriptions-item>

      <el-descriptions-item label="内容">
        <div class="article-view__content">{{ rowData?.content || '-' }}</div>
      </el-descriptions-item>

      <el-descriptions-item label="创建时间">
        {{ rowData?.createdAt ? formatDateTime(rowData.createdAt) : '-' }}
      </el-descriptions-item>

      <el-descriptions-item label="更新时间">
        {{ rowData?.updatedAt ? formatDateTime(rowData.updatedAt) : '-' }}
      </el-descriptions-item>
    </el-descriptions>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </ProDialog>
</template>

<style scoped lang="scss">
.article-view__content {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
}
</style>
