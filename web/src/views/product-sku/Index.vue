<script setup lang="ts">
import { ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import {
  batchDeleteProductSkus,
  deleteProductSku,
  getProductSkus,
  type ProductSku,
  type QueryProductSkuParams,
} from '@/api/productCatalog';
import Edit from './Edit.vue';
import { formatSpecifications } from './specifications';

const tableRef = ref<{ refresh: () => Promise<void>; runBatchDelete: () => Promise<void> }>();
const editVisible = ref(false);
const editingRow = ref<ProductSku | null>(null);

const columns: TableColumn[] = [
  { prop: 'skuCode', label: 'SKU 编码', width: 160 },
  { prop: 'productName', label: '所属产品', minWidth: 160 },
  { prop: 'name', label: 'SKU 名称 / 规格名', minWidth: 180 },
  { prop: 'specifications', label: '规格参数', minWidth: 260, slot: true },
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
  { prop: 'keyword', label: '关键词', type: 'input', placeholder: 'SKU 编码或规格名称' },
];

function fetchSkus(params: Record<string, unknown>) {
  return getProductSkus(params as QueryProductSkuParams);
}

function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}

function handleEdit(row: ProductSku) {
  editingRow.value = row;
  editVisible.value = true;
}

function deleteRequest(row: ProductSku) {
  return deleteProductSku(row.id);
}

function batchDeleteRequest(payload: { ids: Array<number | string> }) {
  return batchDeleteProductSkus(payload.ids);
}

</script>

<template>
  <PageContainer title="SKU 库">
    <Table
      ref="tableRef"
      perm-module="productSku"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchSkus"
      :check-able="true"
      :delete-request="deleteRequest"
      :batch-delete-request="batchDeleteRequest"
      :show-view="false"
      @edit="handleEdit"
    >
      <template #toolbar>
        <Button perm="ProductSku.create" @click="openCreate">新增 SKU</Button>
        <Button perm="ProductSku.batchDelete" :confirm="false" @click="tableRef?.runBatchDelete()">
          批量删除
        </Button>
      </template>
      <template #column-specifications="{ row }"><span>{{ formatSpecifications(row.specifications) }}</span></template>
      <template #column-isEnabled="{ row }">
        <el-tag :type="row.isEnabled ? 'success' : 'info'">{{ row.isEnabled ? '启用' : '停用' }}</el-tag>
      </template>
      <template #column-updatedAt="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
    </Table>
    <Edit v-model:visible="editVisible" :row="editingRow" @success="tableRef?.refresh()" />
  </PageContainer>
</template>
