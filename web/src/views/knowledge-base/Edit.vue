<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import Dialog from '@/components/Dialog.vue';
import Form, { type FormField } from '@/components/Form.vue';
import {
  createKnowledgeBase,
  updateKnowledgeBase,
  type KnowledgeBase,
} from '@/api/knowledgeBase';

const props = defineProps<{
  row?: KnowledgeBase | null;
}>();

const emit = defineEmits<{ success: [] }>();

const visible = defineModel<boolean>('visible', { required: true });
const submitting = ref(false);
const formRef = ref<InstanceType<typeof Form>>();

const form = reactive({
  name: '',
  code: '',
  description: '',
  isEnabled: true,
  sort: 0,
});

const fields: FormField[] = [
  { prop: 'name', label: '名称', type: 'input' },
  { prop: 'code', label: '编码', type: 'input' },
  { prop: 'description', label: '描述', type: 'textarea', rows: 4 },
  {
    prop: 'isEnabled',
    label: '状态',
    component: 'Switch',
    componentProps: { activeText: '启用', inactiveText: '停用' },
  },
  {
    prop: 'sort',
    label: '排序',
    component: 'InputNumber',
    componentProps: { mode: 'integer', min: 0, precision: 0 },
  },
];

const rules: FormRules = {
  name: [{ required: true, message: '请输入知识库名称', trigger: 'blur' }],
};

function resetForm() {
  Object.assign(form, {
    name: '',
    code: '',
    description: '',
    isEnabled: true,
    sort: 0,
  });
}

function fillForm(row: KnowledgeBase) {
  Object.assign(form, {
    name: row.name ?? '',
    code: row.code ?? '',
    description: row.description ?? '',
    isEnabled: !!row.isEnabled,
    sort: row.sort ?? 0,
  });
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
  submitting.value = true;
  try {
    if (props.row) {
      await updateKnowledgeBase(props.row.id, { ...form });
      ElMessage.success('更新成功');
    } else {
      await createKnowledgeBase({ ...form });
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
  <Dialog
    v-model="visible"
    :title="props.row ? '编辑知识库' : '新增知识库'"
    width="680px"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <Form ref="formRef" v-model="form" :fields="fields" :rules="rules" label-width="90px" />
  </Dialog>
</template>
