<script setup lang="ts">
import { computed, ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import ProTable, { type ProTableColumn } from '@/components/ProTable.vue';
import type { ProFormField } from '@/components/ProForm.vue';
import { formatDateTime } from '@/utils/format';
import { getRoles, deleteRole, type Role } from '@/api/role';
import { useUserStore } from '@/stores/user';
import Edit from './Edit.vue';

const tableRef = ref<{ refresh: () => Promise<void>; search: () => Promise<void> }>();
const userStore = useUserStore();
const canCreate = computed(() => userStore.hasPermission('Role.create'));

const columns: ProTableColumn[] = [
  { prop: 'code', label: '角色编码', minWidth: 120 },
  { prop: 'name', label: '角色名称', minWidth: 120 },
  { prop: 'permissions', label: '权限数', width: 100, slot: true },
  { prop: 'isActive', label: '状态', width: 90, slot: true },
  { prop: 'createdAt', label: '创建时间', width: 180, slot: true },
];

const searchFields: ProFormField[] = [
  { prop: 'keyword', label: '关键字', type: 'input', placeholder: '角色名称' },
];

function fetchData(params: Record<string, any>) {
  return getRoles(params);
}

const editVisible = ref(false);
const editingRow = ref<Role | null>(null);

function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}
function handleEdit(row: Role) {
  editingRow.value = row;
  editVisible.value = true;
}
function handleView(row: Role) {
  editingRow.value = row;
  editVisible.value = true;
}
function deleteRoleRequest(row: Role) {
  return deleteRole(row.id);
}
</script>

<template>
  <PageContainer title="角色管理">
    <ProTable
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchData"
      :delete-request="deleteRoleRequest"
      perm-module="role"
      @view="handleView"
      @edit="handleEdit"
    >
      <template #toolbar>
        <el-button v-if="canCreate" type="primary" @click="openCreate">新增角色</el-button>
      </template>

      <template #column-permissions="{ row }">
        {{ row.permissions?.length || 0 }}
      </template>

      <template #column-isActive="{ row }">
        <el-tag :type="row.isActive ? 'success' : 'info'">
          {{ row.isActive ? '启用' : '禁用' }}
        </el-tag>
      </template>

      <template #column-createdAt="{ row }">
        {{ formatDateTime(row.createdAt) }}
      </template>
    </ProTable>

    <Edit
      v-model:visible="editVisible"
      :row="editingRow"
      @success="tableRef?.refresh()"
    />
  </PageContainer>
</template>
