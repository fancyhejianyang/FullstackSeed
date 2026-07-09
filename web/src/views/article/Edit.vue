<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import ProForm, { type ProFormField } from '@/components/ProForm.vue';
import ProDialog from '@/components/ProDialog.vue';
import {
  createArticle,
  updateArticle,
  type Article,
  type ArticleForm,
} from '@/api/article';
import { DicService, type DicItem } from '@/dic/service';
import { ARTICLE_CATEGORY, ARTICLE_STATUS } from '@/dic';

const props = defineProps<{
  // 编辑对象；为 null 表示新增
  row?: Article | null;
}>();

const emit = defineEmits<{ success: [] }>();

// 弹窗显隐（v-model）
const visible = defineModel<boolean>('visible', { required: true });

const submitting = ref(false);
const formRef = ref<InstanceType<typeof ProForm>>();
const form = reactive<ArticleForm>({ title: '', content: '', status: 'draft', category: '' });

const categoryDic = ref<DicItem[]>([]);
const statusDic = ref<DicItem[]>([]);
DicService.init(ARTICLE_CATEGORY, categoryDic);
DicService.init(ARTICLE_STATUS, statusDic);

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

// 打开时回填
watch(visible, (val) => {
  if (val) {
    form.title = props.row?.title ?? '';
    form.content = props.row?.content ?? '';
    form.category = props.row?.category ?? '';
    form.status = props.row?.status ?? 'draft';
  }
});

async function handleSubmit() {
  await formRef.value?.validate();
  submitting.value = true;
  try {
    if (props.row) {
      await updateArticle(props.row.id, { ...form });
      ElMessage.success('更新成功');
    } else {
      await createArticle({ ...form });
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
    :title="props.row ? '编辑文章' : '新增文章'"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <ProForm ref="formRef" v-model="form" :fields="fields" :rules="rules" />
  </ProDialog>
</template>
