<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  numberRangeRule,
  requiredRule,
  runInputRules,
  type InputValidator,
} from './inputRules';

defineOptions({ inheritAttrs: false });

export type InputAmountMode = 'amount' | 'percent';

const props = withDefaults(
  defineProps<{
    mode?: InputAmountMode;
    switchable?: boolean;
    totalAmount?: number | null;
    placeholder?: string;
    clearable?: boolean;
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
    precision: 2,
    percentPrecision: 2,
    required: false,
    rulesEnabled: true,
  },
);

const model = defineModel<number | null>({ default: null });
const activeMode = ref<InputAmountMode>(props.mode);
const editingValue = ref('');
const error = ref('');

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

watch(
  () => props.mode,
  (mode) => {
    activeMode.value = mode;
    syncEditingValue();
  },
);

watch(
  () => model.value,
  () => syncEditingValue(),
);

watch(
  () => props.totalAmount,
  () => {
    if (activeMode.value === 'percent') syncEditingValue();
  },
);

syncEditingValue();

function syncEditingValue() {
  if (model.value === null || model.value === undefined) {
    editingValue.value = '';
    return;
  }
  if (activeMode.value === 'percent') {
    editingValue.value = canUsePercent.value
      ? trimNumber((model.value / Number(props.totalAmount)) * 100, props.percentPrecision)
      : '';
    return;
  }
  editingValue.value = trimNumber(model.value, props.precision);
}

function handleInput(value: string | number) {
  const normalized = normalizeDecimal(
    String(value),
    activeMode.value === 'percent' ? props.percentPrecision : props.precision,
  );
  editingValue.value = normalized;
  model.value = toAmountValue(normalized, false);
  emit('input', model.value);
}

function handleChange(value: string | number) {
  const normalized = normalizeDecimal(
    String(value),
    activeMode.value === 'percent' ? props.percentPrecision : props.precision,
  );
  model.value = toAmountValue(normalized, true);
  syncEditingValue();
  validate();
  emit('change', model.value);
}

function handleBlur(event: FocusEvent) {
  model.value = toAmountValue(editingValue.value, true);
  syncEditingValue();
  validate();
  emit('blur', event);
}

function handleClear() {
  editingValue.value = '';
  model.value = null;
  error.value = '';
  emit('clear');
}

function handleModeChange(mode: InputAmountMode) {
  if (mode === 'percent' && !canUsePercent.value) {
    activeMode.value = 'amount';
    error.value = '请先提供总金额';
    return;
  }
  activeMode.value = mode;
  syncEditingValue();
  emit('modeChange', mode);
}

function toAmountValue(value: string, final: boolean) {
  if (value === '' || value === '-' || value === '.') return final ? null : model.value;
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return null;

  const amount =
    activeMode.value === 'percent'
      ? (Number(props.totalAmount) * numeric) / 100
      : numeric;
  return clampAmount(roundNumber(amount, props.precision));
}

function clampAmount(value: number) {
  let next = value;
  if (typeof props.min === 'number') next = Math.max(props.min, next);
  if (typeof props.max === 'number') next = Math.min(props.max, next);
  return next;
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

function getRules() {
  if (!props.rulesEnabled) return [];
  if (props.rules) return props.rules;
  return [
    ...(props.required ? [requiredRule<number | null>()] : []),
    numberRangeRule(props.min, props.max),
  ];
}

function validate() {
  const result =
    activeMode.value === 'percent' && !canUsePercent.value
      ? '请先提供总金额'
      : runInputRules(model.value, getRules());
  error.value = result === true ? '' : result;
  emit('validate', result);
  return result;
}

defineExpose({ validate });
</script>

<template>
  <div class="input-amount">
    <el-input
      v-bind="$attrs"
      :model-value="editingValue"
      :placeholder="props.placeholder"
      :clearable="props.clearable"
      @update:model-value="handleInput"
      @change="handleChange"
      @focus="emit('focus', $event)"
      @blur="handleBlur"
      @clear="handleClear"
      @keyup.enter="emit('enter', model)"
    >
      <template #prepend v-if="props.switchable">
        <el-segmented
          v-model="activeMode"
          :options="[
            { label: '金额', value: 'amount' },
            { label: '百分比', value: 'percent', disabled: !canUsePercent },
          ]"
          @change="handleModeChange"
        />
      </template>
      <template #suffix>
        <span>{{ suffixText }}</span>
      </template>
    </el-input>
    <div v-if="activeMode === 'percent' && canUsePercent" class="input-amount__hint">
      总金额 {{ trimNumber(Number(props.totalAmount), props.precision) }} 元
    </div>
    <div v-if="error" class="input-amount__error">{{ error }}</div>
  </div>
</template>

<style scoped>
.input-amount__hint,
.input-amount__error {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.2;
}

.input-amount__hint {
  color: #909399;
}

.input-amount__error {
  color: #f56c6c;
}
</style>
