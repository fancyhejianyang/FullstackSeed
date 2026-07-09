<script setup lang="ts">
import { computed, ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import ProTable, { type ProTableColumn } from '@/components/ProTable.vue';
import type { ProFormField } from '@/components/ProForm.vue';
import { formatDateTime } from '@/utils/format';
import { getArticles, deleteArticle, type Article } from '@/api/article';
import { useUserStore } from '@/stores/user';
import { DicService } from '@/dic/service';
import { ARTICLE_CATEGORY, ARTICLE_STATUS } from '@/dic';
import Edit from './Edit.vue';
import View from './View.vue';

// ProTable 为泛型组件，InstanceType 取不到，直接声明暴露的方法类型
const tableRef = ref<{
  refresh: () => Promise<void>;
  search: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();
const userStore = useUserStore();
const canCreate = computed(() => userStore.hasPermission('Article.create'));
const canBatchDelete = computed(() => userStore.hasPermission('Article.batchDelete'));

// 状态字典（用于列渲染）
const statusDic = ref<{ label: string; value: string }[]>([]);
const categoryDic = ref<{ label: string; value: string }[]>([]);
DicService.init(ARTICLE_CATEGORY, categoryDic);
DicService.init(ARTICLE_STATUS, statusDic);

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
function fetchArticles(params: Record<string, any>) {
  return getArticles(params);
}

function getStatusLabel(value: string) {
  return statusDic.value.find((item) => item.value === value)?.label ?? value;
}

function getCategoryLabel(value: string) {
  return categoryDic.value.find((item) => item.value === value)?.label ?? value;
}

// 编辑弹窗
const editVisible = ref(false);
const editingRow = ref<Article | null>(null);

// 查看弹窗
const viewVisible = ref(false);
const viewingRow = ref<Article | null>(null);

function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}

function handleEdit(row: Article) {
  editingRow.value = row;
  editVisible.value = true;
}

function handleView(row: Article) {
  viewingRow.value = row;
  viewVisible.value = true;
}


function deleteArticleRequest(row: Article) {
  return deleteArticle(row.id);
}

async function batchDeleteArticleRequest(payload: { ids: Array<string | number> }) {
  await Promise.all(payload.ids.map((id) => deleteArticle(Number(id))));
}
</script>

<template>
  <PageContainer title="文章管理">
    <ProTable
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchArticles"
      :checkAble="true"
      :delete-request="deleteArticleRequest"
      :batch-delete-request="batchDeleteArticleRequest"
      perm-module="article"
      @view="handleView"
      @edit="handleEdit"
    >
      <template #toolbar>
        <el-button v-if="canCreate" type="primary" @click="openCreate">新增文章</el-button>
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

