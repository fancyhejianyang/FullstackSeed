<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import ProForm, { type ProFormField } from '@/components/ProForm.vue';
import ProDialog from '@/components/ProDialog.vue';
import { getAllPermissions, type Permission } from '@/api/permission';
import {
  createRole,
  updateRole,
  type Role,
  type RoleForm,
} from '@/api/role';

const props = defineProps<{ row?: Role | null }>();
const emit = defineEmits<{ success: [] }>();
const visible = defineModel<boolean>('visible', { required: true });

const submitting = ref(false);
const isEdit = ref(false);
const formRef = ref<InstanceType<typeof ProForm>>();

// 全部权限点（供勾选）
const allPermissions = ref<Permission[]>([]);

const form = reactive({
  code: '',
  name: '',
  description: '',
  isActive: 1 as number,
  permissionIds: [] as number[],
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
  { prop: 'description', label: '描述', type: 'textarea', rows: 2 },
  { prop: 'permissionIds', label: '权限', slot: true },
];

const rules: FormRules = {
  code: [{ required: true, message: '请输入角色编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
};

onMounted(async () => {
  const res = await getAllPermissions();
  allPermissions.value = res.list;
});

watch(visible, (val) => {
  if (val) {
    isEdit.value = !!props.row;
    form.code = props.row?.code ?? '';
    form.name = props.row?.name ?? '';
    form.description = props.row?.description ?? '';
    form.isActive = props.row ? (props.row.isActive ? 1 : 0) : 1;
    form.permissionIds = props.row?.permissions?.map((p) => p.id) ?? [];
  }
});

async function handleSubmit() {
  await formRef.value?.validate();
  submitting.value = true;
  try {
    const payload: RoleForm = {
      code: form.code,
      name: form.name,
      description: form.description,
      isActive: !!form.isActive,
      permissionIds: form.permissionIds,
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
    <ProForm ref="formRef" v-model="form" :fields="fields" :rules="rules">
      <!-- 编辑态编码禁改 -->
      <template v-if="isEdit" #field-code>
        <el-input v-model="form.code" disabled />
      </template>

      <!-- 权限复选框组 -->
      <template #field-permissionIds>
        <el-checkbox-group v-model="form.permissionIds" class="perm-group">
          <el-checkbox
            v-for="p in allPermissions"
            :key="p.id"
            :value="p.id"
          >
            {{ p.name }}（{{ p.code }}）
          </el-checkbox>
        </el-checkbox-group>
      </template>
    </ProForm>
  </ProDialog>
</template>

<style scoped lang="scss">
.perm-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 240px;
  overflow-y: auto;
  width: 100%;
}
</style>
