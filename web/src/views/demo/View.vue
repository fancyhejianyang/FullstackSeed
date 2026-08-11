<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Button from '@/components/Button.vue';
import Dialog from '@/components/Dialog.vue';
import { formatDateTime } from '@/utils/format';
import { getDemo, type Demo } from '@/api/demo';
import { DicService } from '@/dic/service';
import { DEMO_CATEGORY, DEMO_STATUS, DEMO_TAG } from '@/dic';

const props = defineProps<{
  row?: Demo | null;
}>();

const visible = defineModel<boolean>('visible', { required: true });

const loading = ref(false);
const detail = ref<Demo | null>(null);
const rowData = computed(() => detail.value);

const categoryDic = ref<{ label: string; value: string }[]>([]);
const statusDic = ref<{ label: string; value: string }[]>([]);
const tagDic = ref<{ label: string; value: string }[]>([]);
DicService.init(DEMO_CATEGORY, categoryDic);
DicService.init(DEMO_STATUS, statusDic);
DicService.init(DEMO_TAG, tagDic);

function getCategoryLabel(value?: string) {
  if (!value) return '-';
  return categoryDic.value.find((item) => item.value === value)?.label ?? value;
}

function getStatusLabel(value?: string) {
  if (!value) return '-';
  return statusDic.value.find((item) => item.value === value)?.label ?? value;
}

function getTagLabel(value: string) {
  return tagDic.value.find((item) => item.value === value)?.label ?? value;
}

function formatMoney(value?: number | string | null) {
  if (value === null || value === undefined || value === '') return '-';
  const amount = Number(value);
  return Number.isNaN(amount) ? '-' : `${amount.toFixed(2)} 元`;
}

function downloadAttachment() {
  if (!rowData.value?.attachmentUrl) return;
  const link = document.createElement('a');
  link.href = rowData.value.attachmentUrl;
  link.download = rowData.value.attachmentName || '附件文件';
  link.click();
}

const statusTagType = computed(() =>
  rowData.value?.status === 'published' ? 'success' : 'info',
);

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
  <Dialog v-model="visible" title="查看示例" width="860px" :show-footer="false">
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

        <el-descriptions-item label="联系电话">
          {{ rowData?.contactPhone || '-' }}
        </el-descriptions-item>

        <el-descriptions-item label="邮箱">
          {{ rowData?.email || '-' }}
        </el-descriptions-item>

        <el-descriptions-item label="数量">
          {{ rowData?.quantity ?? '-' }}
        </el-descriptions-item>

        <el-descriptions-item label="单价">
          {{ formatMoney(rowData?.unitPrice) }}
        </el-descriptions-item>

        <el-descriptions-item label="预算金额">
          {{ formatMoney(rowData?.budgetAmount) }}
        </el-descriptions-item>

        <el-descriptions-item label="推荐">
          <el-tag :type="rowData?.isFeatured ? 'success' : 'info'">
            {{ rowData?.isFeatured ? '是' : '否' }}
          </el-tag>
        </el-descriptions-item>

        <el-descriptions-item label="标签">
          <div v-if="rowData?.tags?.length" class="demo-view__tags">
            <el-tag v-for="tag in rowData.tags" :key="tag" type="info">
              {{ getTagLabel(tag) }}
            </el-tag>
          </div>
          <span v-else>-</span>
        </el-descriptions-item>

        <el-descriptions-item label="封面图片">
          <el-image
            v-if="rowData?.imageUrl"
            class="demo-view__image"
            :src="rowData.imageUrl"
            :preview-src-list="[rowData.imageUrl]"
            fit="cover"
          />
          <span v-else>-</span>
        </el-descriptions-item>

        <el-descriptions-item label="附件文件">
          <Button
            v-if="rowData?.attachmentUrl"
            link
            type="primary"
            icon="Download"
            @click="downloadAttachment"
          >
            {{ rowData.attachmentName || '下载附件' }}
          </Button>
          <span v-else>-</span>
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
      <Button @click="visible = false">关闭</Button>
    </template>
  </Dialog>
</template>

<style scoped lang="scss">
.demo-view__content {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
}

.demo-view__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.demo-view__image {
  width: 120px;
  height: 90px;
  border-radius: 4px;
}
</style>
