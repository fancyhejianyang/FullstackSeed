<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import ProForm, { type ProFormField } from '@/components/ProForm.vue';
import ProDialog from '@/components/ProDialog.vue';
import {
  createUser,
  getUser,
  updateUser,
  type UserItem,
  type UserForm,
  type BoolLike,
} from '@/api/user';

const props = defineProps<{
  // 编辑对象；为 null 表示新增。这里只用它的 id 触发详情接口
  row?: UserItem | null;
}>();

const emit = defineEmits<{ success: [] }>();

const visible = defineModel<boolean>('visible', { required: true });

const submitting = ref(false);
const loading = ref(false);
const formRef = ref<InstanceType<typeof ProForm>>();
const form = reactive<UserForm>({
  username: '',
  password: '',
  nickname: '',
  isActive: 1,
  isAdmin: 0,
});

// 新增时显示密码与用户名，编辑时用户名禁改、密码留空不更新
const isEdit = ref(false);

const fields = ref<ProFormField[]>([]);

function buildFields() {
  fields.value = [
    { prop: 'username', label: '用户名', type: 'input' },
    { prop: 'nickname', label: '昵称', type: 'input' },
    {
      prop: 'password',
      label: '密码',
      type: 'input',
      placeholder: isEdit.value ? '留空则不修改' : '请输入密码',
    },
    {
      prop: 'isActive',
      label: '状态',
      type: 'select',
      options: [
        { label: '启用', value: 1 },
        { label: '禁用', value: 0 },
      ],
    },
    {
      prop: 'isAdmin',
      label: '超级管理员',
      type: 'select',
      options: [
        { label: '否', value: 0 },
        { label: '是', value: 1 },
      ],
    },
  ];
}

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  isActive: [{ required: true, message: '请选择状态', trigger: 'change' }],
  isAdmin: [{ required: true, message: '请选择是否为超级管理员', trigger: 'change' }],
};

function resetForm() {
  form.username = '';
  form.nickname = '';
  form.password = '';
  form.isActive = 1;
  form.isAdmin = 0;
}

function fillForm(data: UserItem) {
  form.username = data.username ?? '';
  form.nickname = data.nickname ?? '';
  form.password = '';
  form.isActive = toBoolNumber(data.isActive);
  form.isAdmin = toBoolNumber(data.isAdmin);
}

function toBoolNumber(value: BoolLike | undefined): 0 | 1 {
  return value === true || value === 1 || value === '1' || value === 'true'
    ? 1
    : 0;
}

// 打开时：编辑态强制走详情接口取最新数据，新增态取默认值
watch(visible, async (val) => {
  if (!val) return;
  isEdit.value = !!props.row;
  buildFields();

  if (props.row?.id) {
    loading.value = true;
    try {
      const detail = await getUser(props.row.id);
      fillForm(detail);
    } finally {
      loading.value = false;
    }
  } else {
    resetForm();
  }
});

async function handleSubmit() {
  await formRef.value?.validate();
  submitting.value = true;
  try {
    // isActive/isAdmin 在下拉里统一使用 0/1，后端 DTO 会兼容并落库为 tinyint。
    const payload: UserForm = {
      username: form.username,
      nickname: form.nickname,
      isActive: toBoolNumber(form.isActive),
      isAdmin: toBoolNumber(form.isAdmin),
    };
    if (form.password) payload.password = form.password;

    if (props.row) {
      await updateUser(props.row.id, payload);
      ElMessage.success('更新成功');
    } else {
      await createUser(payload as UserForm);
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
    :title="props.row ? '编辑用户' : '新增用户'"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <div v-loading="loading">
      <ProForm ref="formRef" v-model="form" :fields="fields" :rules="rules" label-width="120px">
        <!-- 编辑态用户名禁改 -->
        <template v-if="isEdit" #field-username>
          <el-input v-model="form.username" disabled />
        </template>
      </ProForm>
    </div>
  </ProDialog>
</template>
