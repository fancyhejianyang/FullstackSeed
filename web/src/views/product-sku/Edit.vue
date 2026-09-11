<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import Dialog from '@/components/Dialog.vue';
import Form, { type FormField } from '@/components/Form.vue';
import {
  createProductSku,
  getProductOptions,
  getProductSku,
  updateProductSku,
  type ProductOption,
  type ProductSku,
  type ProductSkuForm,
} from '@/api/productCatalog';

const props = defineProps<{ row?: ProductSku | null }>();
const emit = defineEmits<{ success: [] }>();
const visible = defineModel<boolean>('visible', { required: true });
const formRef = ref<InstanceType<typeof Form>>();
const loading = ref(false);
const submitting = ref(false);
const productOptions = ref<ProductOption[]>([]);
const form = reactive({
  productId: '' as number | '',
  skuCode: '',
  name: '',
  specificationsText: '{\n  "颜色": "蓝色",\n  "重量": { "value": 12, "unit": "kg" }\n}',
  isEnabled: true,
});

const parsedSpecifications = computed<Record<string, unknown> | null>(() => {
  try {
    const value: unknown = JSON.parse(form.specificationsText);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
});

const fields = computed<FormField[]>(() => [
  {
    prop: 'productId',
    label: '所属产品',
    type: 'select',
    options: productOptions.value.map((item) => ({ label: `${item.name}（${item.productCode}）`, value: item.id })),
    hint: '先创建产品，再为同一产品录入不同规格的 SKU。',
  },
  { prop: 'skuCode', label: 'SKU 编码', type: 'input', placeholder: '如 BLUE-PRO-256-BLUE' },
  {
    prop: 'name',
    label: 'SKU 规格名',
    type: 'input',
    placeholder: '如 蓝色 / 256G / 标准版',
    hint: '可选，但建议填写以便人工识别；最终参数以结构化规格为准。',
  },
  {
    prop: 'specificationsText',
    label: '结构化规格 JSON',
    type: 'textarea',
    rows: 9,
    hint: parsedSpecifications.value
      ? 'JSON 格式有效：业务客服可将这些字段作为受控事实读取。'
      : '必须填写 JSON 对象，例如重量、颜色、容量、尺寸等可区分 SKU 的真实参数。',
  },
  {
    prop: 'isEnabled',
    label: '是否启用',
    component: 'Switch',
    componentProps: { activeText: '启用', inactiveText: '停用' },
  },
]);

const rules: FormRules = {
  productId: [{ required: true, message: '请选择所属产品', trigger: 'change' }],
  skuCode: [{ required: true, message: '请输入 SKU 编码', trigger: 'blur' }],
  specificationsText: [{ required: true, message: '请输入结构化规格 JSON', trigger: 'blur' }],
};

watch(visible, async (value) => {
  if (!value) return;
  loading.value = true;
  try {
    productOptions.value = await getProductOptions();
    if (props.row?.id) fillForm(await getProductSku(props.row.id));
    else resetForm();
  } finally {
    loading.value = false;
  }
});

function resetForm() {
  form.productId = productOptions.value.length === 1 ? productOptions.value[0].id : '';
  form.skuCode = '';
  form.name = '';
  form.specificationsText = '{\n  "颜色": "蓝色",\n  "重量": { "value": 12, "unit": "kg" }\n}';
  form.isEnabled = true;
}

function fillForm(data: ProductSku) {
  form.productId = data.productId;
  form.skuCode = data.skuCode;
  form.name = data.name ?? '';
  form.specificationsText = JSON.stringify(data.specifications ?? {}, null, 2);
  form.isEnabled = !!data.isEnabled;
}

function buildPayload(): ProductSkuForm | null {
  if (!form.productId || !parsedSpecifications.value) return null;
  return {
    productId: Number(form.productId),
    skuCode: form.skuCode.trim(),
    name: form.name.trim(),
    specifications: parsedSpecifications.value,
    isEnabled: form.isEnabled,
  };
}

async function handleSubmit() {
  await formRef.value?.validate();
  const payload = buildPayload();
  if (!payload) {
    ElMessage.warning('结构化规格必须是合法 JSON 对象');
    return;
  }
  submitting.value = true;
  try {
    if (props.row?.id) {
      await updateProductSku(props.row.id, payload);
      ElMessage.success('SKU 已更新');
    } else {
      await createProductSku(payload);
      ElMessage.success('SKU 已创建');
    }
    visible.value = false;
    emit('success');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Dialog v-model="visible" :title="props.row ? '编辑 SKU' : '新增 SKU'" width="820px" :confirm-loading="submitting" @confirm="handleSubmit">
    <div v-loading="loading"><Form ref="formRef" v-model="form" :fields="fields" :rules="rules" label-width="120px" /></div>
  </Dialog>
</template>
