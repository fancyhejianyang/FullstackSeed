<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';
import PageContainer from '@/components/PageContainer.vue';
import Dialog from '@/components/Dialog.vue';
import Button from '@/components/Button.vue';
import CheckboxGroup from '@/components/CheckboxGroup.vue';
import { getMenuTree, deleteMenu, updateMenu, type MenuNode } from '@/api/menu';
import { getAllPermissions, type Permission } from '@/api/permission';
import { useUserStore } from '@/stores/user';
import { getPermissionActionLabel } from '@/utils/permission';
import Edit from './Edit.vue';
import Scope from './Scope.vue';

const userStore = useUserStore();
const route = useRoute();
const router = useRouter();
const activeTab = computed({
  get: () =>
    route.query.tab === 'scope' && userStore.isAdmin ? 'scope' : 'structure',
  set: (tab: string) => {
    void router.replace({ query: { ...route.query, tab } });
  },
});

const loading = ref(false);
const tree = ref<MenuNode[]>([]);
const selectedRows = ref<MenuNode[]>([]);

async function fetchData() {
  loading.value = true;
  try {
    tree.value = await getMenuTree();
  } finally {
    loading.value = false;
  }
}

async function refreshAfterChange() {
  await fetchData();
  await userStore.fetchMenus();
}

function handleSelectionChange(rows: MenuNode[]) {
  selectedRows.value = rows;
}

function splitPermissionCodes(code: string | undefined | null) {
  if (!code) return [];
  return code
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toBaseAction(code: string) {
  return code.includes('.') ? code.split('.').pop()! : code;
}

function getMenuModule(menu: MenuNode) {
  const dotted = splitPermissionCodes(menu.permissionCode).find((code) =>
    code.includes('.'),
  );
  if (dotted) return dotted.split('.')[0];

  const segment = menu.path?.split('/').filter(Boolean)[0] ?? '';
  const moduleMap: Record<string, string> = {
    demo: 'Demo',
    users: 'User',
    roles: 'Role',
    permissions: 'Permission',
    menus: 'Menu',
    'system-config': 'Menu',
  };
  if (moduleMap[segment]) return moduleMap[segment];
  if (!segment) return '';

  const normalized = segment.replace(/-([a-z])/g, (_, char: string) =>
    char.toUpperCase(),
  );
  const singular = normalized.endsWith('s')
    ? normalized.slice(0, -1)
    : normalized;
  return singular.charAt(0).toUpperCase() + singular.slice(1);
}

function getPermissionLabel(code: string) {
  const action = toBaseAction(code);
  const matched = permissions.value.find(
    (permission) => permission.code === action,
  );
  return matched?.name || getPermissionActionLabel(code) || code;
}

function formatPermissionCodes(code: string | undefined | null) {
  const codes = splitPermissionCodes(code);
  if (codes.length === 0) return '登录可见';
  return codes.map(getPermissionLabel).join('、');
}

function isTopMenu(row: MenuNode) {
  return row.parentId === null || row.parentId === undefined;
}

// 新增/编辑弹窗
const editVisible = ref(false);
const editingRow = ref<MenuNode | null>(null);
const presetParentId = ref<number | null>(null);

// 分配权限弹窗：批量维护菜单的 permissionCode
const assignVisible = ref(false);
const assigning = ref(false);
const permissionsLoading = ref(false);
const permissions = ref<Permission[]>([]);
const selectedPermissionCodes = ref<string[]>([]);
const permissionOptions = computed(() =>
  permissions.value.map((permission) => ({
    value: permission.code,
    text: permission.name,
  })),
);

async function ensurePermissions() {
  if (permissions.value.length > 0) return;
  permissionsLoading.value = true;
  try {
    const res = await getAllPermissions();
    permissions.value = res.list;
  } finally {
    permissionsLoading.value = false;
  }
}

async function openAssignPermission() {
  if (selectedRows.value.length === 0) {
    ElMessage.warning('请先勾选菜单');
    return;
  }
  selectedPermissionCodes.value =
    selectedRows.value.length === 1
      ? splitPermissionCodes(selectedRows.value[0].permissionCode).map(
          toBaseAction,
        )
      : [];
  assignVisible.value = true;
  await ensurePermissions();
}

function openCreate() {
  editingRow.value = null;
  presetParentId.value = null;
  editVisible.value = true;
}

function openCreateChild(row: MenuNode) {
  editingRow.value = null;
  presetParentId.value = row.id;
  editVisible.value = true;
}

function openEdit(row: MenuNode) {
  editingRow.value = row;
  presetParentId.value = null;
  editVisible.value = true;
}

function getDeleteConfirmText(row: MenuNode) {
  const hasChildren = row.children && row.children.length > 0;
  return hasChildren
    ? `菜单「${row.name}」下含子菜单，删除将一并处理，确认删除？`
    : `确认删除菜单「${row.name}」？`;
}

async function handleDelete(row: MenuNode) {
  await deleteMenu(row.id);
  ElMessage.success('删除成功');
  await refreshAfterChange();
}

async function handleAssignPermission() {
  assigning.value = true;
  try {
    await Promise.all(
      selectedRows.value.map((row) => {
        const moduleName = getMenuModule(row);
        const permissionCode = selectedPermissionCodes.value
          .map((code) =>
            moduleName ? `${moduleName}.${toBaseAction(code)}` : code,
          )
          .join(',');
        return updateMenu(row.id, { permissionCode });
      }),
    );
    ElMessage.success('分配权限成功');
    assignVisible.value = false;
    await refreshAfterChange();
  } finally {
    assigning.value = false;
  }
}

onMounted(fetchData);
</script>

<template>
  <PageContainer title="菜单管理">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="菜单结构" name="structure">
        <div class="menu-toolbar">
          <Button perm="Menu.create" :auto-icon="false" @click="openCreate"
            >新增菜单</Button
          >
          <Button
            v-if="userStore.hasPermission('Permission.read')"
            perm="Menu.update"
            :auto-icon="false"
            :disabled="selectedRows.length === 0"
            @click="(_, done) => done(openAssignPermission())"
          >
            分配权限
          </Button>
        </div>

        <el-table
          v-loading="loading"
          :data="tree"
          row-key="id"
          border
          default-expand-all
          :tree-props="{ children: 'children' }"
          @selection-change="handleSelectionChange"
        >
          <el-table-column type="selection" width="48" />
          <el-table-column prop="name" label="菜单名称" width="180">
            <template #default="{ row }">
              <el-icon v-if="isTopMenu(row) && row.icon" class="menu-icon">
                <component :is="row.icon" />
              </el-icon>
              {{ row.name }}
            </template>
          </el-table-column>
          <el-table-column prop="type" label="类型" width="90">
            <template #default="{ row }">
              <el-tag
                size="small"
                :type="row.type === 'menu' ? 'primary' : 'info'"
              >
                {{ row.type === 'menu' ? '菜单' : '按钮' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="path" label="路由地址" min-width="140">
            <template #default="{ row }">{{ row.path || '-' }}</template>
          </el-table-column>
          <el-table-column prop="permissionCode" label="权限码" min-width="140">
            <template #default="{ row }">{{
              formatPermissionCodes(row.permissionCode)
            }}</template>
          </el-table-column>
          <el-table-column prop="sort" label="排序" width="80" />
          <el-table-column prop="isActive" label="状态" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="row.isActive ? 'success' : 'info'">
                {{ row.isActive ? '启用' : '禁用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <Button
                perm="Menu.create"
                link
                :auto-icon="false"
                @click="openCreateChild(row)"
              >
                加子级
              </Button>
              <Button
                perm="Menu.update"
                link
                :auto-icon="false"
                @click="openEdit(row)"
              >
                编辑
              </Button>
              <Button
                perm="Menu.delete"
                link
                :auto-icon="false"
                :confirm-text="getDeleteConfirmText(row)"
                @click="(_, done) => done(handleDelete(row))"
              >
                删除
              </Button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 新增/编辑弹窗 -->
        <Edit
          v-model:visible="editVisible"
          :row="editingRow"
          :parent-id="presetParentId"
          :tree-data="tree"
          @success="refreshAfterChange"
        />

        <Dialog
          v-model="assignVisible"
          title="分配权限"
          width="560px"
          :confirm-loading="assigning"
          @confirm="handleAssignPermission"
        >
          <div v-loading="permissionsLoading" class="assign-permission">
            <el-alert
              type="info"
              :closable="false"
              :title="`已选择 ${selectedRows.length} 个菜单，保存后将批量更新菜单可见权限。`"
              class="assign-permission__tip"
            />
            <div class="assign-permission__header">权限码</div>
            <CheckboxGroup
              v-model="selectedPermissionCodes"
              :options="permissionOptions"
              border
              class="assign-permission__grid"
            >
              <template #option="{ option }">
                <span class="assign-permission__name">{{ option.text }}</span>
                <span class="assign-permission__code">{{ option.value }}</span>
              </template>
            </CheckboxGroup>
            <div class="assign-permission__hint">
              可勾选多个权限；不勾选直接确定，将清空为登录可见。
            </div>
          </div>
        </Dialog>
      </el-tab-pane>
      <el-tab-pane v-if="userStore.isAdmin" label="分配范围" name="scope" lazy>
        <Scope :tree="tree" :loading="loading" @changed="refreshAfterChange" />
      </el-tab-pane>
    </el-tabs>
  </PageContainer>
</template>

<style scoped>
.menu-toolbar {
  margin-bottom: 12px;
  display: flex;
  gap: 8px;
}
.menu-icon {
  margin-right: 4px;
  vertical-align: middle;
}
.assign-permission__tip {
  margin-bottom: 12px;
}
.assign-permission__header {
  margin-bottom: 8px;
  font-size: 14px;
  color: #606266;
}
.assign-permission .assign-permission__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
}
.assign-permission__grid :deep(.el-checkbox) {
  margin: 0;
  width: 100%;
  height: 42px;
}
.assign-permission__grid :deep(.el-checkbox__label) {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.assign-permission__name {
  flex: 0 0 auto;
}
.assign-permission__code {
  min-width: 0;
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.assign-permission__hint {
  margin-top: 10px;
  font-size: 12px;
  color: #909399;
}
</style>
