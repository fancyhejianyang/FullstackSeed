<script setup lang="ts">
import { computed } from 'vue';

defineOptions({ inheritAttrs: false });

export type InputMode =
  | 'text'
  | 'textarea'
  | 'password'
  | 'search';

const props = withDefaults(
  defineProps<{
    mode?: InputMode;
    placeholder?: string;
    clearable?: boolean;
    trim?: boolean;
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
  model.value = '';
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
  return next;
}
</script>

<template>
  <el-input
    class="input"
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

<style scoped>
.input {
  width: 100%;
}
</style>
