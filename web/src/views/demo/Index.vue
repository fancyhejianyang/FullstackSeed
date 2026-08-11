<script setup lang="ts">
import { ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import ProButton from '@/components/ProButton.vue';
import ProTable, { type ProTableColumn } from '@/components/ProTable.vue';
import type { ProFormField } from '@/components/ProForm.vue';
import { formatDateTime } from '@/utils/format';
import { getDemos, deleteDemo, batchDeleteDemos, type Demo } from '@/api/demo';
import { DicService } from '@/dic/service';
import { DEMO_CATEGORY, DEMO_STATUS, DEMO_TAG } from '@/dic';
import Edit from './Edit.vue';
import View from './View.vue';

// ProTable 为泛型组件，InstanceType 取不到，直接声明暴露的方法类型
const tableRef = ref<{
  refresh: () => Promise<void>;
  search: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();

// 状态字典（用于列渲染）
const statusDic = ref<{ label: string; value: string }[]>([]);
const categoryDic = ref<{ label: string; value: string }[]>([]);
const tagDic = ref<{ label: string; value: string }[]>([]);
DicService.init(DEMO_CATEGORY, categoryDic);
DicService.init(DEMO_STATUS, statusDic);
DicService.init(DEMO_TAG, tagDic);

// 列配置（特殊列用具名插槽 #column-[prop]）
const columns: ProTableColumn[] = [
  { prop: 'title', label: '标题', minWidth: 180 },
  { prop: 'status', label: '状态', width: 100, slot: true },
  { prop: 'category', label: '分类', width: 120, slot: true },
  { prop: 'contactPhone', label: '联系电话', width: 140 },
  { prop: 'quantity', label: '数量', width: 90 },
  { prop: 'unitPrice', label: '单价', width: 120, slot: true },
  { prop: 'budgetAmount', label: '预算金额', width: 120, slot: true },
  { prop: 'isFeatured', label: '推荐', width: 90, slot: true },
  { prop: 'tags', label: '标签', minWidth: 180, slot: true },
  { prop: 'attachmentName', label: '附件', minWidth: 160, slot: true },
  { prop: 'createdAt', label: '创建时间', width: 180, slot: true },
];

// 搜索栏配置
const searchFields: ProFormField[] = [
  { prop: 'keyword', label: '标题', type: 'input', placeholder: '按标题搜索' },
];

// 列表请求函数（ProTable 内部调用）
function fetchDemos(params: Record<string, any>) {
  return getDemos(params);
}

function getStatusLabel(value: string) {
  return statusDic.value.find((item) => item.value === value)?.label ?? value;
}

function getCategoryLabel(value: string) {
  return categoryDic.value.find((item) => item.value === value)?.label ?? value;
}

function getTagLabel(value: string) {
  return tagDic.value.find((item) => item.value === value)?.label ?? value;
}

function formatMoney(value?: number | string | null) {
  if (value === null || value === undefined || value === '') return '-';
  const amount = Number(value);
  return Number.isNaN(amount) ? '-' : `${amount.toFixed(2)} 元`;
}

function downloadAttachment(row: Demo) {
  if (!row.attachmentUrl) return;
  const link = document.createElement('a');
  link.href = row.attachmentUrl;
  link.download = row.attachmentName || '附件文件';
  link.click();
}

// 编辑弹窗
const editVisible = ref(false);
const editingRow = ref<Demo | null>(null);

// 查看弹窗
const viewVisible = ref(false);
const viewingRow = ref<Demo | null>(null);

function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}

function handleEdit(row: Demo) {
  editingRow.value = row;
  editVisible.value = true;
}

function handleView(row: Demo) {
  viewingRow.value = row;
  viewVisible.value = true;
}


function deleteDemoRequest(row: Demo) {
  return deleteDemo(row.id);
}

async function batchDeleteDemoRequest(payload: { ids: Array<string | number> }) {
  await batchDeleteDemos(payload.ids);
}
</script>

<template>
  <PageContainer title="示例管理">
    <ProTable
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchDemos"
      :checkAble="true"
      :delete-request="deleteDemoRequest"
      :batch-delete-request="batchDeleteDemoRequest"
      perm-module="demo"
      @view="handleView"
      @edit="handleEdit"
    >
      <template #toolbar>
        <ProButton perm="Demo.create" @click="openCreate">新增示例</ProButton>
        <ProButton
          perm="Demo.batchDelete"
          :confirm="false"
          @click="tableRef?.runBatchDelete()"
        >
          批量删除
        </ProButton>
      </template>

      <!-- 状态列 -->
      <template #column-status="{ row }">
        <el-tag :type="row.status === 'published' ? 'success' : 'info'">
          {{ getStatusLabel(row.status) }}
        </el-tag>
      </template>

      <!-- 分类列 -->
      <template #column-category="{ row }">
        {{ getCategoryLabel(row.category) }}
      </template>

      <template #column-unitPrice="{ row }">
        {{ formatMoney(row.unitPrice) }}
      </template>

      <template #column-budgetAmount="{ row }">
        {{ formatMoney(row.budgetAmount) }}
      </template>

      <template #column-isFeatured="{ row }">
        <el-tag :type="row.isFeatured ? 'success' : 'info'">
          {{ row.isFeatured ? '是' : '否' }}
        </el-tag>
      </template>

      <template #column-tags="{ row }">
        <div class="demo-index__tags">
          <el-tag v-for="tag in row.tags || []" :key="tag" type="info">
            {{ getTagLabel(tag) }}
          </el-tag>
          <span v-if="!row.tags?.length">-</span>
        </div>
      </template>

      <template #column-attachmentName="{ row }">
        <ProButton
          v-if="row.attachmentUrl"
          link
          type="primary"
          icon="Download"
          @click="downloadAttachment(row)"
        >
          {{ row.attachmentName || '下载附件' }}
        </ProButton>
        <span v-else>-</span>
      </template>

      <!-- 创建时间列 -->
      <template #column-createdAt="{ row }">
        {{ formatDateTime(row.createdAt) }}
      </template>
    </ProTable>

    <!-- 新增/编辑弹窗 -->
    <Edit
      v-model:visible="editVisible"
      :row="editingRow"
      @success="tableRef?.refresh()"
    />

    <!-- 查看弹窗 -->
    <View v-model:visible="viewVisible" :row="viewingRow" />
  </PageContainer>
</template>

<style scoped>
.demo-index__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
