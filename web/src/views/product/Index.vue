<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import Dialog from '@/components/Dialog.vue';
import { getPermissionActionColor } from '@/utils/permission';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import {
  batchDeleteProducts,
  downloadProductTemplate,
  importProducts,
  type ProductImportResult,
  deleteProduct,
  getProducts,
  type Product,
  type QueryProductParams,
} from '@/api/productCatalog';
import Edit from './Edit.vue';

const tableRef = ref<{ refresh: () => Promise<void>; runBatchDelete: () => Promise<void> }>();
const editVisible = ref(false);
const editingRow = ref<Product | null>(null);
const fileInput = ref<HTMLInputElement>();
const exporting = ref(false);
const importing = ref(false);
const resultVisible = ref(false);
const importResult = ref<ProductImportResult>({ importedCount: 0, errors: [] });

async function exportTemplate() {
  exporting.value = true;
  try {
    const url = URL.createObjectURL(await downloadProductTemplate());
    const link = document.createElement('a');
    link.href = url;
    link.download = '产品导入模板.xlsx';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    exporting.value = false;
  }
}

async function handleImport(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
    ElMessage.warning('请选择不超过 5 MB 的 .xlsx 模板文件');
    return;
  }
  importing.value = true;
  try {
    importResult.value = await importProducts(file);
    resultVisible.value = true;
    if (importResult.value.importedCount) await tableRef.value?.refresh();
  } finally {
    importing.value = false;
  }
}

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
    <input ref="fileInput" type="file" accept=".xlsx" hidden @change="handleImport" />
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
        <Button perm="Product.read" icon="Download" :auto-type="false" :type="getPermissionActionColor('Product.export')" :loading="exporting" @click="exportTemplate">模板导出</Button>
        <Button perm="Product.create" icon="Upload" :auto-type="false" :type="getPermissionActionColor('Product.import')" :loading="importing" @click="fileInput?.click()">Excel 导入</Button>
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
    <Dialog v-model="resultVisible" title="产品导入结果" :show-footer="false">
      <el-alert :type="importResult.errors.length ? 'error' : 'success'" :closable="false" :title="importResult.errors.length ? '导入未完成，本次未写入任何产品。请按行号修改后重新导入。' : `成功导入 ${importResult.importedCount} 个产品`" />
      <ul v-if="importResult.errors.length">
        <li v-for="(error, index) in importResult.errors" :key="index">第 {{ error.row }} 行：{{ error.message }}</li>
      </ul>
      <template #footer><Button @click="resultVisible = false">关闭</Button></template>
    </Dialog>
  </PageContainer>
</template>
