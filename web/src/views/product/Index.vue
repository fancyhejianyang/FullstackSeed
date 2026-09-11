<script setup lang="ts">
import { ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import {
  batchDeleteProducts,
  deleteProduct,
  getProducts,
  type Product,
  type QueryProductParams,
} from '@/api/productCatalog';
import Edit from './Edit.vue';

const tableRef = ref<{ refresh: () => Promise<void>; runBatchDelete: () => Promise<void> }>();
const editVisible = ref(false);
const editingRow = ref<Product | null>(null);

const columns: TableColumn[] = [
  { prop: 'productCode', label: '产品编码', width: 150 },
  { prop: 'name', label: '产品名称', minWidth: 180 },
  { prop: 'aliases', label: '产品别名', minWidth: 180, slot: true },
  { prop: 'category', label: '分类', width: 130 },
  { prop: 'isEnabled', label: '状态', width: 90, slot: true },
  { prop: 'updatedAt', label: '更新时间', width: 180, slot: true },
];

const searchFields: FormField[] = [
  {
    prop: 'isEnabled',
    label: '状态',
    type: 'select',
    options: [
      { label: '全部', value: '' },
      { label: '启用', value: true },
      { label: '停用', value: false },
    ],
  },
  { prop: 'keyword', label: '关键词', type: 'input', placeholder: '编码、名称或分类' },
];

function fetchProducts(params: Record<string, unknown>) {
  return getProducts(params as QueryProductParams);
}

function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}

function handleEdit(row: Product) {
  editingRow.value = row;
  editVisible.value = true;
}

function deleteRequest(row: Product) {
  return deleteProduct(row.id);
}

function batchDeleteRequest(payload: { ids: Array<number | string> }) {
  return batchDeleteProducts(payload.ids);
}
</script>

<template>
  <PageContainer title="产品库">
    <Table
      ref="tableRef"
      perm-module="product"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchProducts"
      :check-able="true"
      :delete-request="deleteRequest"
      :batch-delete-request="batchDeleteRequest"
      :show-view="false"
      @edit="handleEdit"
    >
      <template #toolbar>
        <Button perm="Product.create" @click="openCreate">新增产品</Button>
        <Button perm="Product.batchDelete" :confirm="false" @click="tableRef?.runBatchDelete()">
          批量删除
        </Button>
      </template>
      <template #column-aliases="{ row }">
        <span>{{ row.aliases?.join('、') || '-' }}</span>
      </template>
      <template #column-isEnabled="{ row }">
        <el-tag :type="row.isEnabled ? 'success' : 'info'">{{ row.isEnabled ? '启用' : '停用' }}</el-tag>
      </template>
      <template #column-updatedAt="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
    </Table>
    <Edit v-model:visible="editVisible" :row="editingRow" @success="tableRef?.refresh()" />
  </PageContainer>
</template>
