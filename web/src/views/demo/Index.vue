<script setup lang="ts">
import { computed, ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import ProTable, { type ProTableColumn } from '@/components/ProTable.vue';
import type { ProFormField } from '@/components/ProForm.vue';
import { formatDateTime } from '@/utils/format';
import { getDemos, deleteDemo, type Demo } from '@/api/demo';
import { useUserStore } from '@/stores/user';
import { DicService } from '@/dic/service';
import { DEMO_CATEGORY, DEMO_STATUS } from '@/dic';
import Edit from './Edit.vue';
import View from './View.vue';

// ProTable 为泛型组件，InstanceType 取不到，直接声明暴露的方法类型
const tableRef = ref<{
  refresh: () => Promise<void>;
  search: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();
const userStore = useUserStore();
const canCreate = computed(() => userStore.hasPermission('Demo.create'));
const canBatchDelete = computed(() => userStore.hasPermission('Demo.batchDelete'));

// 状态字典（用于列渲染）
const statusDic = ref<{ label: string; value: string }[]>([]);
const categoryDic = ref<{ label: string; value: string }[]>([]);
DicService.init(DEMO_CATEGORY, categoryDic);
DicService.init(DEMO_STATUS, statusDic);

// 列配置（特殊列用具名插槽 #column-[prop]）
const columns: ProTableColumn[] = [
  { prop: 'title', label: '标题', minWidth: 180 },
  { prop: 'status', label: '状态', width: 100, slot: true },
  { prop: 'category', label: '分类', width: 120, slot: true },
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
  await Promise.all(payload.ids.map((id) => deleteDemo(Number(id))));
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
        <el-button v-if="canCreate" type="primary" @click="openCreate">新增示例</el-button>
        <el-button v-if="canBatchDelete" type="danger" @click="tableRef?.runBatchDelete()">
          批量删除
        </el-button>
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
