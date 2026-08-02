<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import ProForm, { type ProFormField } from '@/components/ProForm.vue';
import ProDialog from '@/components/ProDialog.vue';
import { getMenuTree, type MenuNode } from '@/api/menu';
import { getAllPermissions, type Permission } from '@/api/permission';
import {
  createRole,
  getRole,
  updateRole,
  type Role,
  type RoleForm,
} from '@/api/role';

const props = defineProps<{ row?: Role | null }>();
const emit = defineEmits<{ success: [] }>();
const visible = defineModel<boolean>('visible', { required: true });

const submitting = ref(false);
const loading = ref(false);
const isEdit = ref(false);
const formRef = ref<InstanceType<typeof ProForm>>();
const permissionTreeRef = ref();

const menuTree = ref<MenuNode[]>([]);
const basePermissions = ref<Permission[]>([]);
const permissionsLoading = ref(false);

interface PermissionTreeNode {
  id: string;
  label: string;
  type: 'menu' | 'permission' | 'group';
  permissionCode?: string;
  children?: PermissionTreeNode[];
}

const form = reactive({
  code: '',
  name: '',
  isActive: 1 as number,
  permissionCodes: [] as string[],
});

const fields: ProFormField[] = [
  { prop: 'code', label: '角色编码', type: 'input', placeholder: '如 editor' },
  { prop: 'name', label: '角色名称', type: 'input' },
  {
    prop: 'isActive',
    label: '状态',
    type: 'select',
    options: [
      { label: '启用', value: 1 },
      { label: '禁用', value: 0 },
    ],
  },
  { prop: 'permissionIds', label: '菜单权限', slot: true },
];

const rules: FormRules = {
  code: [{ required: true, message: '请输入角色编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
  isActive: [{ required: true, message: '请选择状态', trigger: 'change' }],
};

onMounted(async () => {
  const [menus] = await Promise.all([getMenuTree(), loadBasePermissions()]);
  menuTree.value = menus;
});

async function loadBasePermissions() {
  permissionsLoading.value = true;
  try {
    const res = await getAllPermissions();
    const byCode = new Map<string, Permission>();
    res.list.forEach((permission) => {
      byCode.set(permission.code, permission);
    });
    basePermissions.value = Array.from(byCode.values());
    await nextTick();
    if (visible.value) {
      syncPermissionTreeChecked();
    }
  } finally {
    permissionsLoading.value = false;
  }
}

function splitMenuPermissionCodes(code: string | undefined | null) {
  if (!code) return [];
  return code
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getMenuModule(menu: MenuNode) {
  const dotted = splitMenuPermissionCodes(menu.permissionCode).find((code) =>
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

function getBaseActionLabel(permission: Permission) {
  return `${permission.name}（${permission.code}）`;
}

function isTruthyValue(value: unknown) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

const permissionTreeData = computed<PermissionTreeNode[]>(() => {
  const buildMenus = (menus: MenuNode[]): PermissionTreeNode[] =>
    menus.flatMap((menu) => {
      if (menu.isSystem) return [];

      const children = buildMenus(menu.children || []);
      const moduleName = getMenuModule(menu);
      const permissions = moduleName
        ? basePermissions.value.map((permission) => {
            const code = `${moduleName}.${permission.code}`;
            return {
              id: `permission-${code}`,
              label: getBaseActionLabel(permission),
              type: 'permission' as const,
              permissionCode: code,
            };
          })
        : [];

      const node = {
        id: `menu-${menu.id}`,
        label: menu.name,
        type: 'menu' as const,
        children: [...children, ...permissions],
      };
      return node.children.length ? [node] : [];
    });

  return buildMenus(menuTree.value);
});

function syncPermissionTreeChecked() {
  const codes = new Set(form.permissionCodes);
  const keys: string[] = [];
  const collectCheckedKeys = (nodes: PermissionTreeNode[]) => {
    nodes.forEach((node) => {
      if (node.permissionCode && codes.has(node.permissionCode)) {
        keys.push(node.id);
      }
      if (node.children?.length) collectCheckedKeys(node.children);
    });
  };
  collectCheckedKeys(permissionTreeData.value);
  permissionTreeRef.value?.setCheckedKeys(keys);
}

function resetForm() {
  form.code = '';
  form.name = '';
  form.isActive = 1;
  form.permissionCodes = [];
}

function fillForm(data: Role) {
  form.code = data.code ?? '';
  form.name = data.name ?? '';
  form.isActive = isTruthyValue(data.isActive) ? 1 : 0;
  const legacyRelationCodes = data.permissions
    ?.map((permission) => permission.code)
    .filter((code) => code.includes('.'));
  form.permissionCodes = data.permissionCodes?.length
    ? data.permissionCodes
    : legacyRelationCodes ?? [];
}

// 打开时：编辑态强制走详情接口取最新数据
watch(visible, async (val) => {
  if (!val) return;
  isEdit.value = !!props.row;

  if (props.row?.id) {
    loading.value = true;
    try {
      const detail = await getRole(props.row.id);
      fillForm(detail);
      await nextTick();
      syncPermissionTreeChecked();
    } finally {
      loading.value = false;
    }
  } else {
    resetForm();
    await nextTick();
    syncPermissionTreeChecked();
  }
});

async function handleSubmit() {
  await formRef.value?.validate();
  const checkedKeys = permissionTreeRef.value?.getCheckedKeys(true) ?? [];
  const permissionCodes = checkedKeys
    .filter((key: string) => key.startsWith('permission-'))
    .map((key: string) => key.replace('permission-', ''));
  submitting.value = true;
  try {
    const payload: RoleForm = {
      code: form.code,
      name: form.name,
      isActive: !!form.isActive,
      permissionCodes,
    };
    if (props.row) {
      await updateRole(props.row.id, payload);
      ElMessage.success('更新成功');
    } else {
      await createRole(payload);
      ElMessage.success('创建成功');
    }
    visible.value = false;
    emit('success');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <ProDialog
    v-model="visible"
    :title="props.row ? '编辑角色' : '新增角色'"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <div v-loading="loading">
      <ProForm ref="formRef" v-model="form" :fields="fields" :rules="rules">
        <!-- 编辑态编码禁改 -->
        <template v-if="isEdit" #field-code>
          <el-input v-model="form.code" disabled />
        </template>

        <!-- 菜单权限树 -->
        <template #field-permissionIds>
          <el-tree
            ref="permissionTreeRef"
            v-loading="permissionsLoading"
            :data="permissionTreeData"
            node-key="id"
            show-checkbox
            check-on-click-node
            default-expand-all
            class="perm-tree"
          />
        </template>
      </ProForm>
    </div>
  </ProDialog>
</template>

<style scoped lang="scss">
.perm-tree {
  max-height: 360px;
  overflow-y: auto;
  width: 100%;
  padding: 4px 0;
}
.perm-tree :deep(.el-tree-node__content) {
  height: 30px;
}
.perm-tree :deep(.el-tree-node__content:hover) {
  background: #f5f7fa;
}
.perm-tree :deep(.el-checkbox) {
  margin-right: 6px;
}
</style>
