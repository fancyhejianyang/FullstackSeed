<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import ProForm, { type ProFormField } from '@/components/ProForm.vue';
import ProDialog from '@/components/ProDialog.vue';
import {
  createMenu,
  updateMenu,
  type MenuForm,
  type MenuNode,
} from '@/api/menu';

const props = defineProps<{
  // 编辑对象；为 null 表示新增
  row?: MenuNode | null;
  // 新增子菜单时预置的上级 id
  parentId?: number | null;
  // 完整菜单树（供上级选择）
  treeData: MenuNode[];
}>();

const emit = defineEmits<{ success: [] }>();

const visible = defineModel<boolean>('visible', { required: true });

const submitting = ref(false);
const isEdit = computed(() => !!props.row);

const formRef = ref<InstanceType<typeof ProForm>>();
const form = reactive<{
  parentId: number | null;
  name: string;
  path: string;
  icon: string;
  sort: number;
  type: 'menu' | 'button';
  permissionCode: string;
  isSystem: boolean;
  isActive: boolean;
}>({
  parentId: null,
  name: '',
  path: '',
  icon: '',
  sort: 0,
  type: 'menu',
  permissionCode: '',
  isSystem: false,
  isActive: true,
});

// 上级菜单可选树：编辑态需剔除自身及其子树，避免选到自己造成环
const parentOptions = computed<MenuNode[]>(() => {
  const selfId = props.row?.id;
  if (selfId == null) return props.treeData;
  const prune = (list: MenuNode[]): MenuNode[] =>
    list
      .filter((m) => m.id !== selfId)
      .map((m) => ({ ...m, children: m.children ? prune(m.children) : [] }));
  return prune(props.treeData);
});

const fields: ProFormField[] = [
  { prop: 'parentId', label: '上级菜单', slot: true },
  { prop: 'name', label: '菜单名称', type: 'input' },
  {
    prop: 'type',
    label: '类型',
    type: 'select',
    options: [
      { label: '菜单', value: 'menu' },
      { label: '按钮', value: 'button' },
    ],
  },
  { prop: 'path', label: '路由地址', type: 'input', placeholder: '如 /users' },
  { prop: 'icon', label: '图标', type: 'input', placeholder: 'Element Plus 图标名，如 Menu' },
  { prop: 'permissionCode', label: '权限码', type: 'input', placeholder: '如 Menu.read；为空则登录可见' },
  { prop: 'sort', label: '排序', slot: true },
  { prop: 'isSystem', label: '系统固定', slot: true },
  { prop: 'isActive', label: '状态', slot: true },
];

const rules: FormRules = {
  name: [{ required: true, message: '请输入菜单名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
};

function resetForm() {
  form.parentId = props.parentId ?? null;
  form.name = '';
  form.path = '';
  form.icon = '';
  form.sort = 0;
  form.type = 'menu';
  form.permissionCode = '';
  form.isSystem = false;
  form.isActive = true;
}

function fillForm(data: MenuNode) {
  form.parentId = data.parentId ?? null;
  form.name = data.name ?? '';
  form.path = data.path ?? '';
  form.icon = data.icon ?? '';
  form.sort = data.sort ?? 0;
  form.type = data.type ?? 'menu';
  form.permissionCode = data.permissionCode ?? '';
  form.isSystem = !!data.isSystem;
  form.isActive = !!data.isActive;
}

watch(visible, (val) => {
  if (!val) return;
  if (props.row) {
    fillForm(props.row);
  } else {
    resetForm();
  }
});

async function handleSubmit() {
  await formRef.value?.validate();
  if (!form.name.trim()) {
    ElMessage.warning('请输入菜单名称');
    return;
  }
  submitting.value = true;
  try {
    const payload: MenuForm = {
      parentId: form.parentId,
      name: form.name.trim(),
      path: form.path.trim(),
      icon: form.icon.trim(),
      sort: form.sort,
      type: form.type,
      permissionCode: form.permissionCode.trim(),
      isSystem: form.isSystem,
      isActive: form.isActive,
    };
    if (props.row) {
      await updateMenu(props.row.id, payload);
      ElMessage.success('更新成功');
    } else {
      await createMenu(payload);
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
    :title="isEdit ? '编辑菜单' : '新增菜单'"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <ProForm ref="formRef" v-model="form" :fields="fields" :rules="rules">
      <!-- 上级菜单树选择 -->
      <template #field-parentId>
        <el-tree-select
          v-model="form.parentId"
          :data="parentOptions"
          :props="{ label: 'name', children: 'children' }"
          node-key="id"
          check-strictly
          clearable
          placeholder="不选则为顶级菜单"
          class="menu-edit__full"
        />
      </template>

      <!-- 排序 -->
      <template #field-sort>
        <el-input-number v-model="form.sort" :min="0" :step="1" controls-position="right" />
      </template>

      <!-- 系统固定 -->
      <template #field-isSystem>
        <el-switch
          v-model="form.isSystem"
          active-text="是"
          inactive-text="否"
        />
      </template>

      <!-- 状态 -->
      <template #field-isActive>
        <el-switch
          v-model="form.isActive"
          active-text="启用"
          inactive-text="禁用"
        />
      </template>
    </ProForm>
  </ProDialog>
</template>

<style scoped>
.menu-edit__full {
  width: 100%;
}
</style>
