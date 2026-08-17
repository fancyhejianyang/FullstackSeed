<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
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
const baseFormRef = ref<InstanceType<typeof Form>>();
const contentFormRef = ref<InstanceType<typeof Form>>();

const form = reactive({
  name: '',
  code: '',
  description: '',
  contentType: 'text' as KnowledgeBase['contentType'],
  containsImages: false,
  allowFileUpload: false,
  isEnabled: true,
  sort: 0,
});

const contentTypeOptions = [
  { label: '文本', value: 'text' },
  { label: '文件', value: 'file' },
  { label: '混合', value: 'mixed' },
];

const baseFields: FormField[] = [
  { prop: 'name', label: '名称', type: 'input' },
  { prop: 'code', label: '编码', type: 'input' },
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
  { prop: 'description', label: '描述', type: 'textarea', rows: 4 },
];

const contentFields = computed<FormField[]>(() => [
  {
    prop: 'contentType',
    label: '内容类型',
    type: 'select',
    options: contentTypeOptions,
    placeholder: '请选择内容类型',
  },
  {
    prop: 'containsImages',
    label: '包含图片',
    component: 'Switch',
    componentProps: { activeText: '包含', inactiveText: '不含' },
  },
  {
    prop: 'allowFileUpload',
    label: '文件上传',
    component: 'Switch',
    componentProps: { activeText: '允许', inactiveText: '不允许' },
  },
]);

const rules: FormRules = {
  name: [{ required: true, message: '请输入知识库名称', trigger: 'blur' }],
  contentType: [{ required: true, message: '请选择内容类型', trigger: 'change' }],
};

function resetForm() {
  Object.assign(form, {
    name: '',
    code: '',
    description: '',
    contentType: 'text',
    containsImages: false,
    allowFileUpload: false,
    isEnabled: true,
    sort: 0,
  });
}

function fillForm(row: KnowledgeBase) {
  Object.assign(form, {
    name: row.name ?? '',
    code: row.code ?? '',
    description: row.description ?? '',
    contentType: row.contentType ?? 'text',
    containsImages: !!row.containsImages,
    allowFileUpload: !!row.allowFileUpload,
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

watch(
  () => form.contentType,
  (value) => {
    if (value === 'text') {
      form.allowFileUpload = false;
      return;
    }
    form.allowFileUpload = true;
  },
);

async function handleSubmit() {
  await baseFormRef.value?.validate();
  await contentFormRef.value?.validate();
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
    width="760px"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <div class="knowledge-base-edit">
      <div class="knowledge-base-edit__section">基础信息</div>
      <Form
        ref="baseFormRef"
        v-model="form"
        :fields="baseFields"
        :rules="rules"
        label-width="100px"
      />
      <div class="knowledge-base-edit__section knowledge-base-edit__section--next">
        内容配置
      </div>
      <Form
        ref="contentFormRef"
        v-model="form"
        :fields="contentFields"
        :rules="rules"
        label-width="100px"
      />
    </div>
  </Dialog>
</template>

<style scoped>
.knowledge-base-edit__section {
  margin-bottom: 12px;
  color: #303133;
  font-weight: 600;
}

.knowledge-base-edit__section--next {
  margin-top: 18px;
}
</style>
