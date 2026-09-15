<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import Dialog from '@/components/Dialog.vue';
import Button from '@/components/Button.vue';
import Input from '@/components/Input.vue';
import { specificationPresets, specificationRows, buildSpecifications, type SpecificationRow } from './specifications';
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

  isEnabled: true,
});

const parameters = ref<SpecificationRow[]>([]);
function addPreset(name: string) {
  for (const key of specificationPresets[name] ?? []) {
    if (!parameters.value.some((row) => row.key.trim() === key)) parameters.value.push({ key, value: '' });
  }
}

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
    prop: 'specifications',
    label: '规格参数',
    slot: true,
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
  parameters.value = [];
  addPreset('通用参数');
  form.isEnabled = true;
}

function fillForm(data: ProductSku) {
  form.productId = data.productId;
  form.skuCode = data.skuCode;
  form.name = data.name ?? '';
  parameters.value = specificationRows(data.specifications ?? {});
  form.isEnabled = !!data.isEnabled;
}

function buildPayload(): ProductSkuForm | null {
  if (!form.productId) return null;
  return {
    productId: Number(form.productId),
    skuCode: form.skuCode.trim(),
    name: form.name.trim(),
    specifications: buildSpecifications(parameters.value),
    isEnabled: form.isEnabled,
  };
}

async function handleSubmit() {
  await formRef.value?.validate();
  let payload: ProductSkuForm | null;
  try { payload = buildPayload(); }
  catch (error) { ElMessage.warning((error as Error).message); return; }
  if (!payload) {
    ElMessage.warning('请选择所属产品');
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
    <div v-loading="loading">
      <Form ref="formRef" v-model="form" :fields="fields" :rules="rules" label-width="120px">
        <template #field-specifications>
          <div class="parameters">
            <div class="parameters__actions">
              <Button v-for="(_, name) in specificationPresets" :key="name" size="small" @click="addPreset(String(name))">添加{{ name }}</Button>
              <Button size="small" icon="Plus" @click="parameters.push({ key: '', value: '' })">自定义参数</Button>
            </div>
            <p class="parameters__hint">填写真实参数及单位，例如 540 克、220 伏。空值不保存；添加预设不会覆盖已有参数。已有复杂参数保持原格式，修改后按文本保存。</p>
            <div v-for="(parameter, index) in parameters" :key="index" class="parameters__row">
              <Input v-model="parameter.key" placeholder="参数名称" aria-label="参数名称" />
              <Input v-model="parameter.value" mode="textarea" :rows="2" placeholder="参数值（含单位）" aria-label="参数值" />
              <Button size="small" icon="Delete" @click="parameters.splice(index, 1)">移除</Button>
            </div>
          </div>
        </template>
      </Form>
    </div>
  </Dialog>
</template>

<style scoped>
.parameters { width: 100%; }
.parameters__actions { display: flex; flex-wrap: wrap; gap: 8px; }
.parameters__hint { color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.6; }
.parameters__row { display: grid; grid-template-columns: minmax(120px, 1fr) minmax(160px, 2fr) auto; align-items: start; gap: 8px; margin-bottom: 10px; }
</style>
