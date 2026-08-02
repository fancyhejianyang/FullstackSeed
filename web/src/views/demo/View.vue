<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ProDialog from '@/components/ProDialog.vue';
import { formatDateTime } from '@/utils/format';
import { getDemo, type Demo } from '@/api/demo';
import { DicService } from '@/dic/service';
import { DEMO_CATEGORY, DEMO_STATUS } from '@/dic';

const props = defineProps<{
  row?: Demo | null;
}>();

const visible = defineModel<boolean>('visible', { required: true });

const loading = ref(false);
const detail = ref<Demo | null>(null);
const rowData = computed(() => detail.value);

const categoryDic = ref<{ label: string; value: string }[]>([]);
const statusDic = ref<{ label: string; value: string }[]>([]);
DicService.init(DEMO_CATEGORY, categoryDic);
DicService.init(DEMO_STATUS, statusDic);

function getCategoryLabel(value?: string) {
  if (!value) return '-';
  return categoryDic.value.find((item) => item.value === value)?.label ?? value;
}

function getStatusLabel(value?: string) {
  if (!value) return '-';
  return statusDic.value.find((item) => item.value === value)?.label ?? value;
}

const statusTagType = computed(() => (rowData.value?.status === 'published' ? 'success' : 'info'));

// 打开时强制走详情接口
watch(visible, async (val) => {
  if (!val) {
    detail.value = null;
    return;
  }
  if (!props.row?.id) return;
  loading.value = true;
  try {
    detail.value = await getDemo(props.row.id);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <ProDialog v-model="visible" title="查看示例" :show-footer="false">
    <div v-loading="loading">
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
          <div class="demo-view__content">{{ rowData?.content || '-' }}</div>
        </el-descriptions-item>

        <el-descriptions-item label="创建时间">
          {{ rowData?.createdAt ? formatDateTime(rowData.createdAt) : '-' }}
        </el-descriptions-item>

        <el-descriptions-item label="更新时间">
          {{ rowData?.updatedAt ? formatDateTime(rowData.updatedAt) : '-' }}
        </el-descriptions-item>
      </el-descriptions>
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </ProDialog>
</template>

<style scoped lang="scss">
.demo-view__content {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
}
</style>
