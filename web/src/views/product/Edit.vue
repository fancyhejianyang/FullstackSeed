<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import Dialog from '@/components/Dialog.vue';
import Form, { type FormField } from '@/components/Form.vue';
import {
  createProduct,
  getProduct,
  updateProduct,
  type Product,
  type ProductForm,
} from '@/api/productCatalog';

const props = defineProps<{ row?: Product | null }>();
const emit = defineEmits<{ success: [] }>();
const visible = defineModel<boolean>('visible', { required: true });
const formRef = ref<InstanceType<typeof Form>>();
const loading = ref(false);
const submitting = ref(false);
const form = reactive({
  productCode: '',
  name: '',
  aliasesText: '',
  category: '',
  description: '',
  isEnabled: true,
});

const aliasHint = computed(() =>
  form.aliasesText.trim()
    ? `当前共 ${splitTexts(form.aliasesText).length} 个别名；业务客服可用它识别产品，但 SKU 参数仍以结构化数据为准。`
    : '可选。一行一个或逗号分隔，例如“小蓝、蓝虎机器人”。',
);

const fields = computed<FormField[]>(() => [
  { prop: 'productCode', label: '产品编码', type: 'input', placeholder: '如 BLUE-ROBOT-PRO' },
  { prop: 'name', label: '产品名称', type: 'input', placeholder: '如 蓝虎机器人 Pro' },
  { prop: 'aliasesText', label: '产品别名', type: 'textarea', rows: 2, hint: aliasHint.value },
  { prop: 'category', label: '产品分类', type: 'input', placeholder: '如 服务机器人' },
  {
    prop: 'description',
    label: '说明',
    type: 'textarea',
    rows: 3,
    hint: '用于管理员识别产品；安装、售后等长文资料请上传到知识库，而不是写在这里。',
  },
  {
    prop: 'isEnabled',
    label: '是否启用',
    component: 'Switch',
    componentProps: { activeText: '启用', inactiveText: '停用' },
  },
]);

const rules: FormRules = {
  productCode: [{ required: true, message: '请输入产品编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入产品名称', trigger: 'blur' }],
};

watch(visible, async (value) => {
  if (!value) return;
  if (!props.row?.id) return resetForm();
  loading.value = true;
  try {
    fillForm(await getProduct(props.row.id));
  } finally {
    loading.value = false;
  }
});

function resetForm() {
  form.productCode = '';
  form.name = '';
  form.aliasesText = '';
  form.category = '';
  form.description = '';
  form.isEnabled = true;
}

function fillForm(data: Product) {
  form.productCode = data.productCode;
  form.name = data.name;
  form.aliasesText = (data.aliases ?? []).join('\n');
  form.category = data.category ?? '';
  form.description = data.description ?? '';
  form.isEnabled = !!data.isEnabled;
}

function splitTexts(value: string) {
  return Array.from(new Set(value.split(/[\r\n,，]/).map((item) => item.trim()).filter(Boolean)));
}

function buildPayload(): ProductForm {
  return {
    productCode: form.productCode.trim(),
    name: form.name.trim(),
    aliases: splitTexts(form.aliasesText),
    category: form.category.trim(),
    description: form.description.trim(),
    isEnabled: form.isEnabled,
  };
}

async function handleSubmit() {
  await formRef.value?.validate();
  submitting.value = true;
  try {
    if (props.row?.id) {
      await updateProduct(props.row.id, buildPayload());
      ElMessage.success('产品已更新');
    } else {
      await createProduct(buildPayload());
      ElMessage.success('产品已创建');
    }
    visible.value = false;
    emit('success');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Dialog v-model="visible" :title="props.row ? '编辑产品' : '新增产品'" width="760px" :confirm-loading="submitting" @confirm="handleSubmit">
    <div v-loading="loading"><Form ref="formRef" v-model="form" :fields="fields" :rules="rules" label-width="110px" /></div>
  </Dialog>
</template>
