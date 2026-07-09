<script setup lang="ts">
import { computed, ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import ProTable, { type ProTableColumn } from '@/components/ProTable.vue';
import type { ProFormField } from '@/components/ProForm.vue';
import { formatDateTime } from '@/utils/format';
import { getUsers, deleteUser, type UserItem } from '@/api/user';
import { useUserStore } from '@/stores/user';
import Edit from './Edit.vue';

// ProTable 为泛型组件，InstanceType 取不到，直接声明暴露的方法类型
const tableRef = ref<{ refresh: () => Promise<void>; search: () => Promise<void> }>();
const userStore = useUserStore();
const canCreate = computed(() => userStore.hasPermission('User.create'));

const columns: ProTableColumn[] = [
  { prop: 'username', label: '用户名', minWidth: 140 },
  { prop: 'nickname', label: '昵称', minWidth: 120 },
  { prop: 'roles', label: '角色', minWidth: 160, slot: true },
  { prop: 'isAdmin', label: '超管', width: 90, slot: true },
  { prop: 'isActive', label: '状态', width: 90, slot: true },
  { prop: 'createdAt', label: '创建时间', width: 180, slot: true },
];

const searchFields: ProFormField[] = [
  { prop: 'keyword', label: '关键字', type: 'input', placeholder: '用户名/昵称' },
];

function fetchUsers(params: Record<string, any>) {
  return getUsers(params);
}

const editVisible = ref(false);
const editingRow = ref<UserItem | null>(null);

function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}
function handleEdit(row: UserItem) {
  editingRow.value = row;
  editVisible.value = true;
}
function handleView(row: UserItem) {
  editingRow.value = row;
  editVisible.value = true;
}

function deleteUserRequest(row: UserItem) {
  return deleteUser(row.id);
}
</script>

<template>
  <PageContainer title="账号管理">
    <ProTable
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchUsers"
      :delete-request="deleteUserRequest"
      perm-module="user"
      @view="handleView"
      @edit="handleEdit"
    >
      <template #toolbar>
        <el-button v-if="canCreate" type="primary" @click="openCreate">新增用户</el-button>
      </template>

      <!-- 角色列 -->
      <template #column-roles="{ row }">
        <el-tag
          v-for="r in row.roles"
          :key="r.id"
          class="mr-xs"
          type="info"
        >
          {{ r.name }}
        </el-tag>
        <span v-if="!row.roles?.length">-</span>
      </template>

      <!-- 超管列 -->
      <template #column-isAdmin="{ row }">
        <el-tag v-if="row.isAdmin" type="danger">超管</el-tag>
        <span v-else>-</span>
      </template>

      <!-- 状态列 -->
      <template #column-isActive="{ row }">
        <el-tag :type="row.isActive ? 'success' : 'info'">
          {{ row.isActive ? '启用' : '禁用' }}
        </el-tag>
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
