<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import ProForm, { type ProFormField } from '@/components/ProForm.vue';
import ProDialog from '@/components/ProDialog.vue';
import {
  createUser,
  updateUser,
  type UserItem,
  type UserForm,
} from '@/api/user';

const props = defineProps<{
  // 编辑对象；为 null 表示新增
  row?: UserItem | null;
}>();

const emit = defineEmits<{ success: [] }>();

const visible = defineModel<boolean>('visible', { required: true });

const submitting = ref(false);
const formRef = ref<InstanceType<typeof ProForm>>();
const form = reactive<UserForm>({
  username: '',
  password: '',
  nickname: '',
  isActive: true,
  isAdmin: false,
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
};

watch(visible, (val) => {
  if (val) {
    isEdit.value = !!props.row;
    form.username = props.row?.username ?? '';
    form.nickname = props.row?.nickname ?? '';
    form.password = '';
    form.isActive = props.row ? props.row.isActive : true;
    form.isAdmin = props.row ? props.row.isAdmin : false;
    buildFields();
  }
});

async function handleSubmit() {
  await formRef.value?.validate();
  submitting.value = true;
  try {
    // isActive/isAdmin 在下拉里是 0/1，转布尔
    const payload: UserForm = {
      username: form.username,
      nickname: form.nickname,
      isActive: !!form.isActive,
      isAdmin: !!form.isAdmin,
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
    <ProForm ref="formRef" v-model="form" :fields="fields" :rules="rules" label-width="120px">
      <!-- 编辑态用户名禁改 -->
      <template v-if="isEdit" #field-username>
        <el-input v-model="form.username" disabled />
      </template>
    </ProForm>
  </ProDialog>
</template>
