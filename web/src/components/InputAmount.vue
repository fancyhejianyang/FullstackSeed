<script setup lang="ts">
/**
 * InputAmount — 金额/百分比切换输入组件。
 *
 * 核心能力：
 * - v-model 始终保存“金额值”，百分比只是一种输入视图
 * - `totalAmount` 提供百分比换算基准：百分比 = 当前金额 / 总金额 * 100
 * - `switchable=true` 时使用主输入 + 固定尾部换算区，切换按钮固定在尾部避免 50% 分割
 * - 内置 required/range 校验，可关闭或覆盖；无总金额时会阻止百分比模式并提示
 * - 暴露 `validate()`，适合在业务表单提交前统一触发
 */
import { computed, ref, watch } from 'vue';
import { Sort } from '@element-plus/icons-vue';
import {
  numberRangeRule,
  requiredRule,
  runInputRules,
  type InputValidator,
} from './inputRules';

import { useFormControl } from './formControl';

defineOptions({ inheritAttrs: false });

export type InputAmountMode = 'amount' | 'percent';

const props = withDefaults(
  defineProps<{
    mode?: InputAmountMode;
    switchable?: boolean;
    totalAmount?: number | null;
    placeholder?: string;
    clearable?: boolean;
    disabled?: boolean;
    readonly?: boolean;
    precision?: number;
    percentPrecision?: number;
    min?: number;
    max?: number;
    required?: boolean;
    rulesEnabled?: boolean;
    rules?: InputValidator<number | null>[];
  }>(),
  {
    mode: 'amount',
    switchable: true,
    totalAmount: null,
    placeholder: '',
    clearable: true,
    disabled: false,
    readonly: false,
    precision: 2,
    percentPrecision: 2,
    required: false,
    rulesEnabled: true,
  },
);

const model = defineModel<number | null>({ default: null });
const activeMode = ref<InputAmountMode>(props.mode);
const amountEditing = ref('');
const percentEditing = ref('');
const error = ref('');
let editingSource: InputAmountMode | null = null;
let expectedModel: number | null | undefined;

const emit = defineEmits<{
  input: [value: number | null];
  change: [value: number | null];
  modeChange: [mode: InputAmountMode];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
  clear: [];
  enter: [value: number | null];
  validate: [result: true | string];
}>();

const suffixText = computed(() => (activeMode.value === 'percent' ? '%' : '元'));
const canUsePercent = computed(
  () => typeof props.totalAmount === 'number' && props.totalAmount > 0,
);
const singleEditingValue = computed(() =>
  activeMode.value === 'percent' ? percentEditing.value : amountEditing.value,
);
const mainEditingValue = computed(() => singleEditingValue.value);
const tailText = computed(() =>
  activeMode.value === 'amount'
    ? `占 ${formatPercentDisplay()}%`
    : formatAmountDisplay(),
);

watch(
  () => props.mode,
  (mode) => {
    activeMode.value = mode;
    syncEditingValues();
  },
);

watch(
  () => model.value,
  (value) => {
    if (!Object.is(value, expectedModel)) {
      editingSource = null;
      error.value = '';
    }
    // 用户正在编辑某一侧时，只同步另一侧，避免当前输入框被格式化后造成光标跳动。
    if (editingSource === 'amount') {
      syncPercentValue();
    } else if (editingSource === 'percent') {
      syncAmountValue();
    } else {
      syncEditingValues();
    }
  },
);

watch(
  () => props.totalAmount,
  () => {
    syncPercentValue();
  },
);

syncEditingValues();

function syncEditingValues(value = model.value) {
  syncAmountValue(value);
  syncPercentValue(value);
}

function syncAmountValue(value = model.value) {
  if (value === null || value === undefined) {
    amountEditing.value = '';
    return;
  }
  amountEditing.value = trimNumber(value, props.precision);
}

function syncPercentValue(value = model.value) {
  if (
    value === null ||
    value === undefined ||
    !canUsePercent.value
  ) {
    percentEditing.value = '';
    return;
  }
  percentEditing.value = trimNumber(
    (value / Number(props.totalAmount)) * 100,
    props.percentPrecision,
  );
}

function handleAmountInput(value: string | number) {
  if (blocked.value) return;
  activeMode.value = 'amount';
  const normalized = normalizeDecimal(
    String(value),
    props.precision,
  );
  amountEditing.value = normalized;
  editingSource = 'amount';
  error.value = '';
  const next = toAmountValue(normalized);
  model.value = expectedModel = next;
  syncPercentValue(next);
  emit('input', next);
}

function handleAmountChange(value: string | number) {
  if (blocked.value) return;
  activeMode.value = 'amount';
  const normalized = normalizeDecimal(
    String(value),
    props.precision,
  );
  editingSource = null;
  const next = toAmountValue(normalized);
  model.value = expectedModel = next;
  syncEditingValues(next);
  validate(next);
  emit('change', next);
}

function handleAmountBlur(event: FocusEvent) {
  if (blocked.value) return;
  activeMode.value = 'amount';
  editingSource = null;
  const next = toAmountValue(amountEditing.value);
  model.value = expectedModel = next;
  syncEditingValues(next);
  validate(next);
  emit('blur', event);
}

function handlePercentInput(value: string | number) {
  if (blocked.value) return;
  if (!canUsePercent.value) {
    error.value = '请先提供总金额';
    return;
  }
  activeMode.value = 'percent';
  const normalized = normalizeDecimal(String(value), props.percentPrecision);
  percentEditing.value = normalized;
  editingSource = 'percent';
  error.value = '';
  const next = toPercentAmountValue(normalized);
  model.value = expectedModel = next;
  syncAmountValue(next);
  emit('input', next);
}

function handlePercentChange(value: string | number) {
  if (blocked.value) return;
  if (!canUsePercent.value) {
    error.value = '请先提供总金额';
    return;
  }
  activeMode.value = 'percent';
  const normalized = normalizeDecimal(String(value), props.percentPrecision);
  editingSource = null;
  const next = toPercentAmountValue(normalized);
  model.value = expectedModel = next;
  syncEditingValues(next);
  validate(next);
  emit('change', next);
}

function handlePercentBlur(event: FocusEvent) {
  if (blocked.value) return;
  activeMode.value = 'percent';
  editingSource = null;
  const next = toPercentAmountValue(percentEditing.value);
  model.value = expectedModel = next;
  syncEditingValues(next);
  validate(next);
  emit('blur', event);
}

function handleClear() {
  if (blocked.value) return;
  amountEditing.value = '';
  percentEditing.value = '';
  model.value = null;
  error.value = '';
  emit('clear');
}

function handleModeToggle() {
  if (blocked.value) return;
  if (!canUsePercent.value) {
    error.value = '请先提供总金额';
    return;
  }
  editingSource = null;
  syncEditingValues();
  activeMode.value = activeMode.value === 'amount' ? 'percent' : 'amount';
  emit('modeChange', activeMode.value);
}

function handleMainInput(value: string | number) {
  if (activeMode.value === 'percent') {
    handlePercentInput(value);
    return;
  }
  handleAmountInput(value);
}

function handleMainChange(value: string | number) {
  if (activeMode.value === 'percent') {
    handlePercentChange(value);
    return;
  }
  handleAmountChange(value);
}

function handleMainBlur(event: FocusEvent) {
  if (activeMode.value === 'percent') {
    handlePercentBlur(event);
    return;
  }
  handleAmountBlur(event);
}

function handleSingleInput(value: string | number) {
  if (activeMode.value === 'percent') {
    handlePercentInput(value);
    return;
  }
  handleAmountInput(value);
}

function handleSingleChange(value: string | number) {
  if (activeMode.value === 'percent') {
    handlePercentChange(value);
    return;
  }
  handleAmountChange(value);
}

function handleSingleBlur(event: FocusEvent) {
  if (activeMode.value === 'percent') {
    handlePercentBlur(event);
    return;
  }
  handleAmountBlur(event);
}

function toAmountValue(value: string) {
  if (value === '' || value === '-' || value === '.' || value === '-.') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;

  return roundNumber(numeric, props.precision);
}

function toPercentAmountValue(value: string) {
  if (value === '' || value === '-' || value === '.' || value === '-.') return null;
  if (!canUsePercent.value) return model.value;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;

  // 组件对外仍输出金额，百分比输入只在这里按 totalAmount 折算一次。
  const amount = (Number(props.totalAmount) * numeric) / 100;
  return roundNumber(amount, props.precision);
}

function normalizeDecimal(value: string, precision: number) {
  const sign = value.startsWith('-') ? '-' : '';
  const cleaned = value.replace(/[^\d.]/g, '');
  const [integer = '', ...decimalParts] = cleaned.split('.');
  const decimal = decimalParts.join('');
  if (!decimalParts.length) return `${sign}${integer}`;
  return `${sign}${integer}.${decimal.slice(0, precision)}`;
}

function roundNumber(value: number, precision: number) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function trimNumber(value: number, precision: number) {
  return roundNumber(value, precision).toString();
}

function formatAmountDisplay() {
  const amount = model.value ?? 0;
  return `￥${roundNumber(amount, props.precision).toLocaleString('en-US', {
    minimumFractionDigits: props.precision,
    maximumFractionDigits: props.precision,
  })}`;
}

function formatPercentDisplay() {
  if (!canUsePercent.value || model.value === null || model.value === undefined) {
    return roundNumber(0, props.percentPrecision).toFixed(props.percentPrecision);
  }
  return roundNumber(
    (model.value / Number(props.totalAmount)) * 100,
    props.percentPrecision,
  ).toFixed(props.percentPrecision);
}

function getRules() {
  if (!props.rulesEnabled) return [];
  if (props.rules) return props.rules;
  return [
    ...(props.required ? [requiredRule<number | null>()] : []),
    numberRangeRule(props.min, props.max),
  ];
}

function validate(value = model.value) {
  const result =
    activeMode.value === 'percent' && !canUsePercent.value
      ? '请先提供总金额'
      : runInputRules(value, getRules());
  error.value = result === true ? '' : result;
  emit('validate', result);
  return result;
}

function clearValidate() {
  error.value = '';
}

function reset() {
  editingSource = null;
  syncEditingValues();
  clearValidate();
}

const { form } = useFormControl({ validate, clearValidate, reset });
const effectiveDisabled = computed(() => props.disabled || !!form?.disabled);
const blocked = computed(() => effectiveDisabled.value || props.readonly);

defineExpose({ validate, clearValidate, reset });
</script>

<template>
  <div class="input-amount">
    <div v-if="props.switchable" class="input-amount__group">
      <el-input
        v-bind="$attrs"
        :disabled="effectiveDisabled"
        :readonly="props.readonly"
        class="input-amount__main"
        :model-value="mainEditingValue"
        :placeholder="
          props.placeholder || (activeMode === 'percent' ? '请输入百分比' : '请输入金额')
        "
        :clearable="props.clearable"
        @update:model-value="handleMainInput"
        @change="handleMainChange"
        @focus="emit('focus', $event)"
        @blur="handleMainBlur"
        @clear="handleClear"
        @keyup.enter="emit('enter', model)"
      >
        <template v-if="activeMode === 'amount'" #prefix>
          <span>￥</span>
        </template>
        <template v-else #suffix>
          <span>%</span>
        </template>
      </el-input>

      <div class="input-amount__tail">
        <el-button
          class="input-amount__switch"
          :disabled="blocked || !canUsePercent"
          @click="handleModeToggle"
        >
          <el-icon><Sort /></el-icon>
        </el-button>
        <span class="input-amount__tail-text">{{ tailText }}</span>
      </div>
    </div>

    <el-input
      v-else
      v-bind="$attrs"
      :disabled="effectiveDisabled"
      :readonly="props.readonly"
      class="input-amount__single"
      :model-value="singleEditingValue"
      :placeholder="props.placeholder"
      :clearable="props.clearable"
      @update:model-value="handleSingleInput"
      @change="handleSingleChange"
      @focus="emit('focus', $event)"
      @blur="handleSingleBlur"
      @clear="handleClear"
      @keyup.enter="emit('enter', model)"
    >
      <template #suffix>
        <span>{{ suffixText }}</span>
      </template>
    </el-input>

    <div v-if="error" class="input-amount__error">{{ error }}</div>
  </div>
</template>

<style scoped>
.input-amount,
.input-amount__group,
.input-amount__single {
  width: 100%;
}

.input-amount__group {
  display: flex;
  align-items: stretch;
}

.input-amount__main {
  flex: 1 1 0;
  min-width: 0;
}

.input-amount__tail {
  display: flex;
  flex: 0 0 150px;
  width: 150px;
  min-width: 150px;
  height: 32px;
  margin-left: -1px;
  overflow: hidden;
  border: 1px solid #dcdfe6;
  border-radius: 0 4px 4px 0;
  background-color: #ffffff;
}

.input-amount__switch {
  flex: 0 0 38px;
  width: 38px;
  height: 30px;
  padding: 0;
  border: 0;
  border-right: 1px solid #dcdfe6;
  border-radius: 0;
  color: #409eff;
  background-color: transparent;
}

.input-amount__tail-text {
  flex: 1;
  min-width: 0;
  padding: 0 10px;
  color: #303133;
  font-size: 14px;
  line-height: 30px;
  text-align: right;
  white-space: nowrap;
}

.input-amount :deep(.el-input) {
  width: 100%;
}

.input-amount :deep(.input-amount__main .el-input__wrapper) {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.input-amount__error {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.2;
}

.input-amount__error {
  color: #f56c6c;
}
</style>
