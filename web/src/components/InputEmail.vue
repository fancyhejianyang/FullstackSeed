<script setup lang="ts">
/**
 * InputEmail — 邮箱输入组件。
 *
 * 核心能力：
 * - v-model 保存完整邮箱字符串，UI 上拆成账号 + 固定 `@` + 后缀下拉
 * - 账号里输入 `@` 时会自动拆分到后缀；后缀支持预设下拉，也支持手动创建
 * - 内置邮箱格式校验，可通过 `rulesEnabled=false` 关闭，或通过 `rules` 覆盖
 * - 宽度默认撑满父级，后缀区保持固定宽度，避免表单布局抖动
 */
import { ref, watch } from 'vue';
import {
  emailRule,
  requiredRule,
  runInputRules,
  type InputValidator,
} from './inputRules';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    placeholder?: string;
    domainPlaceholder?: string;
    domains?: string[];
    clearable?: boolean;
    required?: boolean;
    rulesEnabled?: boolean;
    rules?: InputValidator<string | null>[];
  }>(),
  {
    placeholder: '请输入邮箱账号',
    domainPlaceholder: '请选择或输入后缀',
    domains: () => [
      'qq.com',
      '163.com',
      '126.com',
      'gmail.com',
      'outlook.com',
      'hotmail.com',
      'foxmail.com',
      'icloud.com',
    ],
    clearable: true,
    required: false,
    rulesEnabled: true,
  },
);

const model = defineModel<string | null>({ default: '' });
const error = ref('');
const account = ref('');
const domain = ref('');
let syncing = false;

const emit = defineEmits<{
  input: [value: string | null];
  change: [value: string | null];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
  clear: [];
  enter: [value: string | null];
  validate: [result: true | string];
}>();

watch(
  () => model.value,
  (value) => {
    // 内部组合邮箱时会写回 model；用 syncing 防止 watch 反向拆分导致输入光标跳动。
    if (syncing) return;
    syncPartsFromModel(value);
  },
  { immediate: true },
);

function normalize(value: string | number | null) {
  return String(value ?? '').trim();
}

function syncPartsFromModel(value: string | null | undefined) {
  const next = normalize(value);
  if (!next) {
    account.value = '';
    domain.value = '';
    return;
  }

  const atIndex = next.indexOf('@');
  if (atIndex >= 0) {
    account.value = next.slice(0, atIndex);
    domain.value = next.slice(atIndex + 1);
    return;
  }
  account.value = next;
  domain.value = '';
}

function composeValue() {
  const nextAccount = normalize(account.value);
  const nextDomain = normalize(domain.value).replace(/^@+/, '');
  if (!nextAccount) return '';
  // 有账号但没后缀时保留尾部 @，让用户明确看到组件已自动补齐分隔符。
  return nextDomain ? `${nextAccount}@${nextDomain}` : `${nextAccount}@`;
}

function updateModel(shouldValidate = false) {
  const next = composeValue();
  syncing = true;
  model.value = next;
  syncing = false;
  emit('input', next);
  if (shouldValidate) {
    validate();
    emit('change', model.value);
  }
}

function handleAccountInput(value: string | number) {
  const next = normalize(value);
  const atIndex = next.indexOf('@');
  if (atIndex >= 0) {
    account.value = next.slice(0, atIndex);
    domain.value = next.slice(atIndex + 1);
  } else {
    account.value = next;
  }
  updateModel();
}

function handleAccountChange(value: string | number) {
  handleAccountInput(value);
  updateModel(true);
}

function handleDomainChange(value: string | number) {
  domain.value = normalize(value).replace(/^@+/, '');
  updateModel(true);
}

function handleBlur(event: FocusEvent) {
  account.value = normalize(account.value);
  domain.value = normalize(domain.value).replace(/^@+/, '');
  updateModel();
  validate();
  emit('blur', event);
}

function handleClear() {
  account.value = '';
  domain.value = '';
  model.value = '';
  error.value = '';
  emit('clear');
  emit('change', '');
}

function getRules() {
  if (!props.rulesEnabled) return [];
  if (props.rules) return props.rules;
  return [
    ...(props.required ? [requiredRule<string | null>()] : []),
    emailRule(),
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
  <div class="input-email">
    <div class="input-email__group">
      <el-input
        v-bind="$attrs"
        class="input-email__account"
        :model-value="account"
        :placeholder="props.placeholder"
        :clearable="props.clearable"
        autocomplete="email"
        inputmode="email"
        @update:model-value="handleAccountInput"
        @change="handleAccountChange"
        @focus="emit('focus', $event)"
        @blur="handleBlur"
        @clear="handleClear"
        @keyup.enter="emit('enter', model)"
      />
      <span class="input-email__at">@</span>
      <el-select
        class="input-email__domain"
        v-model="domain"
        filterable
        allow-create
        default-first-option
        :reserve-keyword="false"
        :placeholder="props.domainPlaceholder"
        @change="handleDomainChange"
        @blur="handleBlur"
      >
        <el-option
          v-for="item in props.domains"
          :key="item"
          :label="item"
          :value="item"
        />
      </el-select>
    </div>
    <div v-if="error" class="input-email__error">{{ error }}</div>
  </div>
</template>

<style scoped>
.input-email {
  width: 100%;
}

.input-email__group {
  display: flex;
  align-items: stretch;
  width: 100%;
}

.input-email__account {
  flex: 1 1 0;
  min-width: 0;
}

.input-email__at {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 34px;
  height: 32px;
  margin: 0 -1px;
  border: 1px solid #dcdfe6;
  color: #606266;
  background-color: #f5f7fa;
}

.input-email__domain {
  flex: 0 0 180px;
  width: 180px;
}

.input-email :deep(.input-email__account .el-input__wrapper) {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.input-email :deep(.input-email__domain .el-select__wrapper) {
  min-height: 32px;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.input-email__error {
  margin-top: 4px;
  color: #f56c6c;
  font-size: 12px;
  line-height: 1.2;
}
</style>
