<script setup lang="ts">
/**
 * InputNumber — 数字输入组件。
 *
 * 核心能力：
 * - v-model 固定输出 number | null，输入过程允许短暂保留 `-` / `.` 这类未完成状态
 * - `mode` 支持 number / integer / money；money 按 `precision` 限制小数位
 * - min/max 只参与校验，不在输入或失焦时强制改值；内置规则可关闭或覆盖
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
  // 忽略输入值经 v-model 返回的同值同步，保留 `1.` / `1.20` / `-` 等编辑草稿。
  // 父表单真正赋入不同值（加载、重置等）时仍正常回显。
  if (Object.is(value, parseValue(draftValue.value))) return;
  const nextValue = formatDraftValue(value);
  if (draftValue.value !== nextValue) {
    draftValue.value = nextValue;
    error.value = '';
  }
});

function handleInput(value: string | number) {
  const normalized = normalizeInput(String(value));
  draftValue.value = normalized;
  model.value = parseValue(normalized);
  error.value = '';
  emit('input', model.value);
}

function handleChange(value: string | number) {
  model.value = parseValue(String(value));
  draftValue.value = formatDraftValue(model.value);
  validate();
  emit('change', model.value);
}

function handleBlur(event: FocusEvent) {
  model.value = parseValue(draftValue.value);
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
  if (validate() === true) emit('enter', model.value);
}

function parseValue(value: string): number | null {
  // 未完成数字只保留在 draftValue 中，对外始终输出 number | null。
  const normalized = normalizeInput(value);
  if (
    normalized === '' ||
    normalized === '-' ||
    normalized === '.' ||
    normalized === '-.'
  ) {
    return null;
  }

  let numeric = Number(normalized);
  if (Number.isNaN(numeric)) return null;
  if (props.mode === 'integer') numeric = Math.trunc(numeric);
  // 范围约束由 validate 提示，不应篡改用户输入（例如输入 180 的首位 1）。
  return numeric;
}

function normalizeInput(value: string) {
  return props.mode === 'integer'
    ? normalizeInteger(value)
    : normalizeNumber(
        value,
        props.mode === 'money' ? props.precision : undefined,
      );
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
