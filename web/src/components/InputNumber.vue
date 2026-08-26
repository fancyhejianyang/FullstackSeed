<script setup lang="ts">
/**
 * InputNumber — 数字输入组件。
 *
 * 核心能力：
 * - v-model 固定输出 number | null，输入过程允许短暂保留 `-` / `.` 这类未完成状态
 * - `mode` 支持 number / integer / money；money 按 `precision` 限制小数位
 * - 内置 required/range 校验，可通过 `rulesEnabled=false` 关闭，或通过 `rules` 完全覆盖
 * - `prefixText` / `suffixText` 用于单位、币种等轻量展示，宽度默认撑满
 * - 暴露 `validate()`，业务表单可在提交前主动触发组件内置校验
 */
import { computed, ref, watch } from 'vue';
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
const draftValue = ref(formatDraftValue(model.value));

const emit = defineEmits<{
  input: [value: number | null];
  change: [value: number | null];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
  clear: [];
  enter: [value: number | null];
  validate: [result: true | string];
}>();

const displayValue = computed(() => draftValue.value);

watch(model, (value) => {
  const nextValue = formatDraftValue(value);
  if (draftValue.value !== nextValue) {
    draftValue.value = nextValue;
  }
});

function handleInput(value: string | number) {
  const normalized = normalizeInput(String(value));
  draftValue.value = normalized;
  const parsed = parseValue(normalized, false);
  model.value = typeof parsed === 'number' ? parsed : null;
  emit('input', model.value);
}

function handleChange(value: string | number) {
  model.value = parseValue(String(value), true) as number | null;
  draftValue.value = formatDraftValue(model.value);
  validate();
  emit('change', model.value);
}

function handleBlur(event: FocusEvent) {
  model.value = parseValue(draftValue.value, true) as number | null;
  draftValue.value = formatDraftValue(model.value);
  validate();
  emit('blur', event);
}

function handleClear() {
  model.value = null;
  draftValue.value = '';
  error.value = '';
  emit('clear');
}

function handleEnter() {
  emit('enter', model.value);
}

function parseValue(value: string, final: boolean) {
  // 输入中保留未完成的数字形态，最终确认时再落成 null，避免用户无法输入负数/小数。
  const normalized = normalizeInput(value);
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

function normalizeInput(value: string) {
  return props.mode === 'integer'
    ? normalizeInteger(value)
    : normalizeNumber(value, props.mode === 'money' ? props.precision : undefined);
}

function formatDraftValue(value: number | null) {
  return value === null || value === undefined ? '' : String(value);
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
.input-number,
.input-number :deep(.el-input) {
  width: 100%;
}

.input-number__error {
  margin-top: 4px;
  color: #f56c6c;
  font-size: 12px;
  line-height: 1.2;
}
</style>
