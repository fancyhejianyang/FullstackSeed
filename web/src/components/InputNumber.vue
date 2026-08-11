<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  numberRangeRule,
  requiredRule,
  runInputRules,
  type InputValidator,
} from './inputRules';

defineOptions({ inheritAttrs: false });

export type InputNumberMode = 'number' | 'integer' | 'money';

const props = withDefaults(
  defineProps<{
    mode?: InputNumberMode;
    placeholder?: string;
    clearable?: boolean;
    precision?: number;
    min?: number;
    max?: number;
    required?: boolean;
    rulesEnabled?: boolean;
    rules?: InputValidator<number | null>[];
    prefixText?: string;
    suffixText?: string;
  }>(),
  {
    mode: 'number',
    placeholder: '',
    clearable: true,
    precision: 2,
    required: false,
    rulesEnabled: true,
    prefixText: '',
    suffixText: '',
  },
);

const model = defineModel<number | null>({ default: null });
const error = ref('');

const emit = defineEmits<{
  input: [value: number | null];
  change: [value: number | null];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
  clear: [];
  enter: [value: number | null];
  validate: [result: true | string];
}>();

const displayValue = computed(() => model.value ?? '');

function handleInput(value: string | number) {
  const parsed = parseValue(String(value), false);
  model.value = typeof parsed === 'number' ? parsed : null;
  emit('input', model.value);
}

function handleChange(value: string | number) {
  model.value = parseValue(String(value), true) as number | null;
  validate();
  emit('change', model.value);
}

function handleBlur(event: FocusEvent) {
  model.value = parseValue(String(model.value ?? ''), true) as number | null;
  validate();
  emit('blur', event);
}

function handleClear() {
  model.value = null;
  error.value = '';
  emit('clear');
}

function handleEnter() {
  emit('enter', model.value);
}

function parseValue(value: string, final: boolean) {
  const normalized =
    props.mode === 'integer'
      ? normalizeInteger(value)
      : normalizeNumber(value, props.mode === 'money' ? props.precision : undefined);
  if (normalized === '' || normalized === '-' || normalized === '.') {
    return final ? null : normalized;
  }

  let numeric = Number(normalized);
  if (Number.isNaN(numeric)) return null;
  if (props.mode === 'integer') numeric = Math.trunc(numeric);
  if (typeof props.min === 'number') numeric = Math.max(props.min, numeric);
  if (typeof props.max === 'number') numeric = Math.min(props.max, numeric);
  return numeric;
}

function normalizeInteger(value: string) {
  const sign = value.startsWith('-') ? '-' : '';
  return `${sign}${value.replace(/\D/g, '')}`;
}

function normalizeNumber(value: string, precision?: number) {
  const sign = value.startsWith('-') ? '-' : '';
  const cleaned = value.replace(/[^\d.]/g, '');
  const [integer = '', ...decimalParts] = cleaned.split('.');
  const decimal = decimalParts.join('');
  if (!decimalParts.length) return `${sign}${integer}`;
  const limitedDecimal =
    typeof precision === 'number' ? decimal.slice(0, precision) : decimal;
  return `${sign}${integer}.${limitedDecimal}`;
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
  const result = runInputRules(model.value, getRules());
  error.value = result === true ? '' : result;
  emit('validate', result);
  return result;
}

defineExpose({ validate });
</script>

<template>
  <div class="input-number">
    <el-input
      v-bind="$attrs"
      :model-value="displayValue"
      :placeholder="props.placeholder"
      :clearable="props.clearable"
      :class="{ 'is-error': !!error }"
      @update:model-value="handleInput"
      @change="handleChange"
      @focus="emit('focus', $event)"
      @blur="handleBlur"
      @clear="handleClear"
      @keyup.enter="handleEnter"
    >
      <template v-if="props.prefixText" #prefix>
        <span>{{ props.prefixText }}</span>
      </template>
      <template v-if="props.suffixText" #suffix>
        <span>{{ props.suffixText }}</span>
      </template>
    </el-input>
    <div v-if="error" class="input-number__error">{{ error }}</div>
  </div>
</template>

<style scoped>
.input-number__error {
  margin-top: 4px;
  color: #f56c6c;
  font-size: 12px;
  line-height: 1.2;
}
</style>
