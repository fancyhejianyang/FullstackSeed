<script setup lang="ts">
/**
 * InputPhone — 手机号输入组件。
 *
 * 核心能力：
 * - v-model 固定输出 string | null，输入时自动过滤非数字并限制 11 位
 * - 内置手机号格式校验，可关闭或用 `rules` 覆盖
 * - 保留 el-input attrs 透传，适合在 Form 动态组件里直接撑满使用
 * - 暴露 `validate()`，方便提交前统一校验
 */
import { computed, ref } from 'vue';
import {
  phoneRule,
  requiredRule,
  runInputRules,
  type InputValidator,
} from './inputRules';

import { useFormControl } from './formControl';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    placeholder?: string;
    clearable?: boolean;
    disabled?: boolean;
    readonly?: boolean;
    required?: boolean;
    rulesEnabled?: boolean;
    rules?: InputValidator<string | null>[];
  }>(),
  {
    placeholder: '请输入手机号',
    clearable: true,
    disabled: false,
    readonly: false,
    required: false,
    rulesEnabled: true,
  },
);

const model = defineModel<string | null>({ default: '' });
const error = ref('');

const emit = defineEmits<{
  input: [value: string | null];
  change: [value: string | null];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
  clear: [];
  enter: [value: string | null];
  validate: [result: true | string];
}>();

function handleInput(value: string | number) {
  if (blocked.value) return;
  error.value = '';
  const next = String(value).replace(/\D/g, '').slice(0, 11);
  model.value = next;
  emit('input', next);
}

function handleChange(value: string | number) {
  if (blocked.value) return;
  const next = String(value).replace(/\D/g, '').slice(0, 11);
  model.value = next;
  validate(next);
  emit('change', next);
}

function handleBlur(event: FocusEvent) {
  validate();
  emit('blur', event);
}

function handleClear() {
  if (blocked.value) return;
  model.value = '';
  error.value = '';
  emit('clear');
}

function getRules() {
  if (!props.rulesEnabled) return [];
  if (props.rules) return props.rules;
  return [
    ...(props.required ? [requiredRule<string | null>()] : []),
    phoneRule(),
  ];
}

function validate(value = model.value) {
  const result = runInputRules(value, getRules());
  error.value = result === true ? '' : result;
  emit('validate', result);
  return result;
}

function clearValidate() {
  error.value = '';
}

function reset() {
  clearValidate();
}

const { form } = useFormControl({ validate, clearValidate, reset });
const effectiveDisabled = computed(() => props.disabled || !!form?.disabled);
const blocked = computed(() => effectiveDisabled.value || props.readonly);

defineExpose({ validate, clearValidate, reset });
</script>

<template>
  <div class="input-phone">
    <el-input
      v-bind="$attrs"
      :disabled="effectiveDisabled"
      :readonly="props.readonly"
      :model-value="model"
      :placeholder="props.placeholder"
      :clearable="props.clearable"
      maxlength="11"
      @update:model-value="handleInput"
      @change="handleChange"
      @focus="emit('focus', $event)"
      @blur="handleBlur"
      @clear="handleClear"
      @keyup.enter="emit('enter', model)"
    />
    <div v-if="error" class="input-phone__error">{{ error }}</div>
  </div>
</template>

<style scoped>
.input-phone,
.input-phone :deep(.el-input) {
  width: 100%;
}

.input-phone__error {
  margin-top: 4px;
  color: #f56c6c;
  font-size: 12px;
  line-height: 1.2;
}
</style>
