<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import Form, { type FormField } from '@/components/Form.vue';
import Dialog from '@/components/Dialog.vue';
import UploadFile from '@/components/UploadFile.vue';
import {
  createDemo,
  getDemo,
  updateDemo,
  type Demo,
  type DemoForm,
} from '@/api/demo';
import { DicService, type DicItem } from '@/dic/service';
import { DEMO_CATEGORY, DEMO_STATUS, DEMO_TAG } from '@/dic';
import type { SelectOption } from '@/components/Select.vue';

const props = defineProps<{
  // 编辑对象；为 null 表示新增
  row?: Demo | null;
}>();

const emit = defineEmits<{ success: [] }>();

const visible = defineModel<boolean>('visible', { required: true });

const submitting = ref(false);
const loading = ref(false);
const formRef = ref<InstanceType<typeof Form>>();
const form = reactive<DemoForm>({
  title: '',
  content: '',
  status: 'draft',
  category: '',
  publishedAt: '',
  activeRange: [],
  contactPhone: '',
  email: '',
  quantity: 0,
  unitPrice: 0,
  budgetAmount: 0,
  isFeatured: false,
  allowComment: true,
  tags: [],
  channels: [],
  imageUrl: '',
  attachmentName: '',
  attachmentUrl: '',
});

const categoryDic = ref<DicItem[]>([]);
const statusDic = ref<DicItem[]>([]);
const tagDic = ref<DicItem[]>([]);
DicService.init(DEMO_CATEGORY, categoryDic);
DicService.init(DEMO_STATUS, statusDic);
DicService.init(DEMO_TAG, tagDic);

const demoTotalAmount = 10000;
const toSelectOptions = (items: DicItem[]): SelectOption[] =>
  items.map((item) => ({
    value: String(item.value),
    text: item.label,
  }));
const categoryOptions = computed(() => toSelectOptions(categoryDic.value));
const statusOptions = computed(() => toSelectOptions(statusDic.value));
const tagOptions = computed(() => toSelectOptions(tagDic.value));
const channelOptions = [
  { value: 'web', text: 'Web' },
  { value: 'app', text: 'App' },
  { value: 'mini', text: '小程序' },
];

const fields: FormField[] = [
  { prop: 'title', label: '标题', type: 'input' },
  {
    prop: 'category',
    label: '分类',
    component: 'Select',
    componentProps: { options: categoryOptions, debounce: 250 },
  },
  {
    prop: 'status',
    label: '状态',
    component: 'Select',
    componentProps: { options: statusOptions, debounce: 250 },
  },
  {
    prop: 'publishedAt',
    label: '发布日期',
    component: 'DatePicker',
    componentProps: { placeholder: '请选择发布日期' },
  },
  {
    prop: 'activeRange',
    label: '有效期',
    component: 'DateRange',
  },
  {
    prop: 'contactPhone',
    label: '联系电话',
    component: 'InputPhone',
    componentProps: { required: false },
  },
  {
    prop: 'email',
    label: '邮箱',
    component: 'InputEmail',
    componentProps: { required: false },
  },
  {
    prop: 'quantity',
    label: '数量',
    component: 'InputNumber',
    componentProps: { mode: 'integer', min: 0, precision: 0 },
  },
  {
    prop: 'unitPrice',
    label: '单价',
    component: 'InputNumber',
    componentProps: { mode: 'money', min: 0, suffixText: '元' },
  },
  {
    prop: 'budgetAmount',
    label: '预算金额',
    component: 'InputAmount',
    componentProps: {
      totalAmount: demoTotalAmount,
      switchable: true,
      min: 0,
      max: demoTotalAmount,
    },
  },
  {
    prop: 'isFeatured',
    label: '推荐',
    component: 'Switch',
    componentProps: { activeText: '推荐', inactiveText: '普通' },
  },
  {
    prop: 'allowComment',
    label: '允许评论',
    component: 'Checkbox',
    componentProps: { label: '允许用户评论' },
  },
  {
    prop: 'tags',
    label: '标签',
    component: 'SelectMultiple',
    componentProps: {
      options: tagOptions,
      debounce: 250,
      maxTagCount: 2,
    },
  },
  {
    prop: 'channels',
    label: '发布渠道',
    component: 'CheckboxGroup',
    componentProps: { options: channelOptions },
  },
  {
    prop: 'imageUrl',
    label: '封面图片',
    component: 'UploadImage',
    componentProps: { maxSizeMb: 5 },
  },
  { prop: 'attachmentUrl', label: '附件文件', slot: true },
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
  form.publishedAt = '';
  form.activeRange = [];
  form.contactPhone = '';
  form.email = '';
  form.quantity = 0;
  form.unitPrice = 0;
  form.budgetAmount = 0;
  form.isFeatured = false;
  form.allowComment = true;
  form.tags = [];
  form.channels = [];
  form.imageUrl = '';
  form.attachmentName = '';
  form.attachmentUrl = '';
}

function fillForm(data: Demo) {
  form.title = data.title ?? '';
  form.content = data.content ?? '';
  form.category = data.category ?? '';
  form.status = data.status ?? 'draft';
  form.publishedAt = data.publishedAt ?? '';
  form.activeRange = data.activeRange ?? [];
  form.contactPhone = data.contactPhone ?? '';
  form.email = data.email ?? '';
  form.quantity = data.quantity ?? 0;
  form.unitPrice = data.unitPrice ?? 0;
  form.budgetAmount = data.budgetAmount ?? 0;
  form.isFeatured = !!data.isFeatured;
  form.allowComment = data.allowComment ?? true;
  form.tags = data.tags ?? [];
  form.channels = data.channels ?? [];
  form.imageUrl = data.imageUrl ?? '';
  form.attachmentName = data.attachmentName ?? '';
  form.attachmentUrl = data.attachmentUrl ?? '';
}

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
  <Dialog
    v-model="visible"
    :title="props.row ? '编辑示例' : '新增示例'"
    width="860px"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <div v-loading="loading">
      <Form ref="formRef" v-model="form" :fields="fields" :rules="rules">
        <template #field-attachmentUrl>
          <UploadFile
            v-model="form.attachmentUrl"
            v-model:name="form.attachmentName"
          />
        </template>
      </Form>
    </div>
  </Dialog>
</template>
