<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import Dialog from '@/components/Dialog.vue';
import Button from '@/components/Button.vue';
import Input from '@/components/Input.vue';
import { specificationRows, buildSpecifications, type SpecificationRow } from './specifications';
import Form, { type FormField } from '@/components/Form.vue';
import { getPermissionActionColor } from '@/utils/permission';
import {
  createProductSku,
  getProductOptions,
  getNextSkuCode,
  getProductSku,
  getProductSkus,
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
const referenceLoading = ref(false);
const submitting = ref(false);
const productOptions = ref<ProductOption[]>([]);
const loadedSku = ref<ProductSku | null>(null);
const referenceSkuCode = ref('');
const form = reactive({
  productId: '' as number | '',
  skuCode: '',
  name: '',

  isEnabled: true,
});

const parameters = ref<SpecificationRow[]>([]);
const commonParameters = computed(() => parameters.value.filter((row) => row.builtin));
const customParameters = computed(() => parameters.value.filter((row) => !row.builtin));
let previewVersion = 0;
let referenceVersion = 0;
async function refreshSkuCode(productId: number | '') {
  const version = ++previewVersion;
  if (!productId) { form.skuCode = ''; return; }
  if (loadedSku.value && loadedSku.value.productId === productId) {
    form.skuCode = loadedSku.value.skuCode;
    return;
  }
  form.skuCode = '';
  try {
    const result = await getNextSkuCode(Number(productId));
    if (version === previewVersion && visible.value) form.skuCode = result.skuCode;
  } catch {
    // The request layer displays the error; saving still allocates a code safely.
  }
}

async function refreshReferenceParameters(productId: number | '') {
  const version = ++referenceVersion;
  referenceLoading.value = false;
  if (props.row?.id) return;

  referenceSkuCode.value = '';
  parameters.value = specificationRows({});
  if (!productId) return;

  referenceLoading.value = true;
  try {
    const result = await getProductSkus({
      productId: Number(productId),
      page: 1,
      pageSize: 1,
    });
    if (version !== referenceVersion || !visible.value || form.productId !== productId) return;
    const referenceSku = result.list[0];
    if (!referenceSku) return;

    const referenceCustomParameters = specificationRows(referenceSku.specifications ?? {})
      .filter((row) => !row.builtin)
      .map((row) => ({ name: row.name, label: row.label, value: '' }));
    parameters.value = [...specificationRows({}), ...referenceCustomParameters];
    if (referenceCustomParameters.length) referenceSkuCode.value = referenceSku.skuCode;
  } catch {
    // The request layer displays the error; users can still add parameters manually.
  } finally {
    if (version === referenceVersion) referenceLoading.value = false;
  }
}

watch(() => form.productId, (productId) => {
  if (!loading.value && visible.value) {
    void refreshSkuCode(productId);
    void refreshReferenceParameters(productId);
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
  { prop: 'skuCode', label: 'SKU 编码', type: 'input', componentProps: { readonly: true }, placeholder: '选择产品后自动生成', hint: '产品编号 + 序号，例如 PRODUCT-001。保存时分配最终编码。' },
  {
    prop: 'name',
    label: 'SKU 规格',
    type: 'input',
    placeholder: '如 2.5 × 75 毫米 / 蓝色 / 256G',
    hint: '填写用于区分同一产品下不同 SKU 的核心规格，无需重复产品名称。',
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
};

watch(visible, async (value) => {
  if (!value) {
    ++previewVersion;
    ++referenceVersion;
    referenceLoading.value = false;
    return;
  }
  loading.value = true;
  try {
    productOptions.value = await getProductOptions();
    if (props.row?.id) fillForm(await getProductSku(props.row.id));
    else resetForm();
    await Promise.all([
      refreshSkuCode(form.productId),
      refreshReferenceParameters(form.productId),
    ]);
  } finally {
    loading.value = false;
  }
});

function resetForm() {
  loadedSku.value = null;
  referenceSkuCode.value = '';
  form.productId = productOptions.value.length === 1 ? productOptions.value[0].id : '';
  form.skuCode = '';
  form.name = '';
  parameters.value = specificationRows({});
  form.isEnabled = true;
}

function fillForm(data: ProductSku) {
  loadedSku.value = data;
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
    name: form.name.trim(),
    specifications: buildSpecifications(parameters.value),
    isEnabled: form.isEnabled,
  };
}

async function handleSubmit() {
  if (loading.value || submitting.value) return;
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
  <Dialog v-model="visible" :title="props.row ? '编辑 SKU' : '新增 SKU'" width="1000px" :confirm-loading="submitting" @confirm="handleSubmit">
    <div v-loading="loading">
      <Form ref="formRef" v-model="form" :fields="fields" :rules="rules" label-width="120px">
        <template #field-specifications>
          <div class="parameters">
            <h4>内置通用参数</h4>
            <p class="parameters__hint">填写真实参数及单位，留空不保存。</p>
            <div v-for="parameter in commonParameters" :key="parameter.name" class="parameters__common-row">
              <span>{{ parameter.label }}</span>
              <Input v-model="parameter.value" placeholder="参数值（含单位）" :aria-label="parameter.label" />
            </div>
            <div v-loading="referenceLoading" class="parameters__custom">
              <h4>自定义参数</h4>
              <div class="parameters__actions">
                <Button size="small" icon="Plus" @click="parameters.push({ name: '', label: '', value: '' })">添加自定义参数</Button>
              </div>
              <p class="parameters__hint">
                Name 为字段名，Label 为显示名称，Value 为参数值。例如 ratedVoltage / 额定电压 / 220 伏。Name 不能重复或占用内置字段。
                <template v-if="referenceSkuCode">已根据参考 SKU {{ referenceSkuCode }} 带出 Name 和 Label，请填写 Value。</template>
              </p>
              <div v-if="customParameters.length" class="parameters__row"><span>Name</span><span>Label</span><span>Value</span><span /></div>
              <div v-for="(parameter, index) in customParameters" :key="index" class="parameters__row">
                <Input v-model="parameter.name" placeholder="字段名" aria-label="Name" />
                <Input v-model="parameter.label" placeholder="显示名称" aria-label="Label" />
                <Input v-model="parameter.value" placeholder="参数值（含单位）" aria-label="Value" />
                <Button
                  size="small"
                  :type="getPermissionActionColor('delete')"
                  icon="Delete"
                  @click="parameters.splice(parameters.indexOf(parameter), 1)"
                >
                  删除
                </Button>
              </div>
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
.parameters__common-row { display: grid; grid-template-columns: 70px 1fr; align-items: center; gap: 8px; margin-bottom: 10px; }
.parameters__row { display: grid; grid-template-columns: minmax(100px, 1fr) minmax(100px, 1fr) minmax(140px, 2fr) 64px; align-items: center; gap: 8px; margin-bottom: 10px; }
</style>
