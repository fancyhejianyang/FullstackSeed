<script setup lang="ts">
import { ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import ProTable, { type ProTableColumn } from '@/components/ProTable.vue';
import type { ProFormField } from '@/components/ProForm.vue';
import { formatDateTime } from '@/utils/format';
import { getPermissions, deletePermission, type Permission } from '@/api/permission';
import Edit from './Edit.vue';

// ProTable 为泛型组件，InstanceType 取不到，直接声明暴露的方法类型
const tableRef = ref<{ refresh: () => Promise<void>; search: () => Promise<void> }>();

// 权限类型 → 标签配色
const TYPE_META: Record<string, { label: string; type: 'primary' | 'success' | 'info' }> = {
  menu: { label: '菜单', type: 'primary' },
  button: { label: '按钮', type: 'success' },
  api: { label: '接口', type: 'info' },
};

const columns: ProTableColumn[] = [
  { prop: 'code', label: '权限编码', minWidth: 180 },
  { prop: 'name', label: '权限名称', minWidth: 160 },
  { prop: 'type', label: '类型', width: 100, slot: true },
  { prop: 'description', label: '描述', minWidth: 180, slot: true },
  { prop: 'createdAt', label: '创建时间', width: 180, slot: true },
];

const searchFields: ProFormField[] = [
  { prop: 'keyword', label: '关键字', type: 'input', placeholder: '编码/名称' },
];

function fetchPermissions(params: Record<string, any>) {
  return getPermissions(params);
}

function getTypeMeta(type: string) {
  return TYPE_META[type] ?? { label: type || '-', type: 'info' as const };
}

const editVisible = ref(false);
const editingRow = ref<Permission | null>(null);

function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}

function handleEdit(row: Permission) {
  editingRow.value = row;
  editVisible.value = true;
}

function deletePermissionRequest(row: Permission) {
  return deletePermission(row.id);
}
</script>

<template>
  <PageContainer title="权限管理">
    <ProTable
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchPermissions"
      :delete-request="deletePermissionRequest"
      :show-view="false"
      @edit="handleEdit"
    >
      <template #toolbar>
        <el-button type="primary" @click="openCreate">新增权限</el-button>
      </template>

      <!-- 类型列 -->
      <template #column-type="{ row }">
        <el-tag size="small" :type="getTypeMeta(row.type).type">
          {{ getTypeMeta(row.type).label }}
        </el-tag>
      </template>

      <!-- 描述列 -->
      <template #column-description="{ row }">
        {{ row.description || '-' }}
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
  </PageContainer>
</template>
