<script setup lang="ts">
import { computed } from 'vue';

defineOptions({ inheritAttrs: false });

export type InputMode =
  | 'text'
  | 'textarea'
  | 'password'
  | 'integer'
  | 'number'
  | 'money'
  | 'search';

const props = withDefaults(
  defineProps<{
    mode?: InputMode;
    placeholder?: string;
    clearable?: boolean;
    trim?: boolean;
    precision?: number;
    min?: number;
    max?: number;
    rows?: number;
    maxlength?: number;
    prefixText?: string;
    suffixText?: string;
  }>(),
  {
    mode: 'text',
    placeholder: '',
    clearable: true,
    trim: true,
    precision: 2,
    rows: 4,
    prefixText: '',
    suffixText: '',
  },
);

const model = defineModel<string | number | null>({ default: '' });

const emit = defineEmits<{
  input: [value: string | number | null];
  change: [value: string | number | null];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
  clear: [];
  enter: [value: string | number | null];
  search: [value: string | number | null];
}>();

const inputType = computed(() => {
  if (props.mode === 'textarea') return 'textarea';
  if (props.mode === 'password') return 'password';
  return 'text';
});

const displayValue = computed(() => model.value ?? '');

function handleInput(value: string | number) {
  const parsed = parseValue(String(value), false);
  model.value = parsed;
  emit('input', parsed);
}

function handleChange(value: string | number) {
  const parsed = parseValue(String(value), true);
  model.value = parsed;
  emit('change', parsed);
}

function handleBlur(event: FocusEvent) {
  model.value = parseValue(String(model.value ?? ''), true);
  emit('blur', event);
}

function handleClear() {
  model.value = isNumberMode() ? null : '';
  emit('clear');
}

function handleEnter() {
  emit('enter', model.value);
  if (props.mode === 'search') {
    emit('search', model.value);
  }
}

function parseValue(value: string, final: boolean) {
  let next = props.trim && final ? value.trim() : value;

  if (props.mode === 'integer') {
    next = normalizeInteger(next);
  }
  if (props.mode === 'number' || props.mode === 'money') {
    next = normalizeNumber(next, props.mode === 'money' ? props.precision : undefined);
  }

  if (!isNumberMode()) return next;
  if (next === '' || next === '-' || next === '.') return final ? null : next;

  let numeric = Number(next);
  if (Number.isNaN(numeric)) return null;
  if (typeof props.min === 'number') numeric = Math.max(props.min, numeric);
  if (typeof props.max === 'number') numeric = Math.min(props.max, numeric);
  return props.mode === 'integer' ? Math.trunc(numeric) : numeric;
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

function isNumberMode() {
  return ['integer', 'number', 'money'].includes(props.mode);
}
</script>

<template>
  <el-input
    v-bind="$attrs"
    :model-value="displayValue"
    :type="inputType"
    :rows="props.rows"
    :maxlength="props.maxlength"
    :placeholder="props.placeholder"
    :clearable="props.clearable"
    :show-password="props.mode === 'password'"
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
</template>
