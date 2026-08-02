<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import ProForm, { type ProFormField } from '@/components/ProForm.vue';
import ProDialog from '@/components/ProDialog.vue';
import {
  createDemo,
  getDemo,
  updateDemo,
  type Demo,
  type DemoForm,
} from '@/api/demo';
import { DicService, type DicItem } from '@/dic/service';
import { DEMO_CATEGORY, DEMO_STATUS } from '@/dic';

const props = defineProps<{
  // 编辑对象；为 null 表示新增
  row?: Demo | null;
}>();

const emit = defineEmits<{ success: [] }>();

// 弹窗显隐（v-model）
const visible = defineModel<boolean>('visible', { required: true });

const submitting = ref(false);
const loading = ref(false);
const formRef = ref<InstanceType<typeof ProForm>>();
const form = reactive<DemoForm>({ title: '', content: '', status: 'draft', category: '' });

const categoryDic = ref<DicItem[]>([]);
const statusDic = ref<DicItem[]>([]);
DicService.init(DEMO_CATEGORY, categoryDic);
DicService.init(DEMO_STATUS, statusDic);

const fields: ProFormField[] = [
  { prop: 'title', label: '标题', type: 'input' },
  { prop: 'category', label: '分类', type: 'select', options: categoryDic },
  { prop: 'status', label: '状态', type: 'select', options: statusDic },
  { prop: 'content', label: '内容', type: 'textarea', rows: 4 },
];

const rules: FormRules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
};

function resetForm() {
  form.title = '';
  form.content = '';
  form.category = '';
  form.status = 'draft';
}

function fillForm(data: Demo) {
  form.title = data.title ?? '';
  form.content = data.content ?? '';
  form.category = data.category ?? '';
  form.status = data.status ?? 'draft';
}

// 打开时：编辑态强制走详情接口取最新数据
watch(visible, async (val) => {
  if (!val) return;
  if (props.row?.id) {
    loading.value = true;
    try {
      const detail = await getDemo(props.row.id);
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
    if (props.row) {
      await updateDemo(props.row.id, { ...form });
      ElMessage.success('更新成功');
    } else {
      await createDemo({ ...form });
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
    :title="props.row ? '编辑示例' : '新增示例'"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <div v-loading="loading">
      <ProForm ref="formRef" v-model="form" :fields="fields" :rules="rules" />
    </div>
  </ProDialog>
</template>
