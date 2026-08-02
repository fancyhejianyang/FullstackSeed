<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import ProForm, { type ProFormField } from '@/components/ProForm.vue';
import ProDialog from '@/components/ProDialog.vue';
import {
  createPermission,
  updatePermission,
  type Permission,
  type PermissionForm,
  type PermissionType,
} from '@/api/permission';

const props = defineProps<{
  // 编辑对象；为 null 表示新增
  row?: Permission | null;
}>();

const emit = defineEmits<{ success: [] }>();

const visible = defineModel<boolean>('visible', { required: true });

const submitting = ref(false);
const isEdit = ref(false);
const formRef = ref<InstanceType<typeof ProForm>>();

const form = reactive<{
  code: string;
  name: string;
  type: PermissionType;
}>({
  code: '',
  name: '',
  type: 'api',
});

const fields: ProFormField[] = [
  { prop: 'code', label: '权限编码', slot: true },
  { prop: 'name', label: '权限名称', type: 'input' },
  {
    prop: 'type',
    label: '类型',
    type: 'select',
    options: [
      { label: '菜单', value: 'menu' },
      { label: '按钮', value: 'button' },
      { label: '接口', value: 'api' },
    ],
  },
];

// 权限码格式：纯动作标识（小写字母开头的驼峰，与模块无关），如 read / batchDelete
const rules: FormRules = {
  code: [
    { required: true, message: '请输入权限编码', trigger: 'blur' },
    {
      pattern: /^[a-z][A-Za-z0-9]*$/,
      message: '为纯动作标识，如 read、batchDelete',
      trigger: 'blur',
    },
  ],
  name: [{ required: true, message: '请输入权限名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
};

function resetForm() {
  form.code = '';
  form.name = '';
  form.type = 'api';
}

function fillForm(data: Permission) {
  form.code = data.code ?? '';
  form.name = data.name ?? '';
  form.type = data.type ?? 'api';
}

watch(visible, (val) => {
  if (!val) return;
  isEdit.value = !!props.row;
  if (props.row) {
    fillForm(props.row);
  } else {
    resetForm();
  }
});

async function handleSubmit() {
  await formRef.value?.validate();
  submitting.value = true;
  try {
    const payload: PermissionForm = {
      code: form.code,
      name: form.name,
      type: form.type,
    };
    if (props.row) {
      await updatePermission(props.row.id, payload);
      ElMessage.success('更新成功');
    } else {
      await createPermission(payload);
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
    :title="isEdit ? '编辑权限' : '新增权限'"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <ProForm ref="formRef" v-model="form" :fields="fields" :rules="rules" label-width="90px">
      <!-- 编辑态编码禁改（编码是权限的唯一标识） -->
      <template #field-code>
        <el-input
          v-model="form.code"
          :disabled="isEdit"
          placeholder="如 read、batchDelete"
        />
      </template>
    </ProForm>
  </ProDialog>
</template>
