<script setup lang="ts">
/**
 * DatePicker — 单日期/日期时间选择组件。
 *
 * 核心能力：
 * - 基于 el-date-picker，统一默认 format/valueFormat 为 `YYYY-MM-DD`
 * - v-model 固定使用 string | null，便于与后端 DTO 的日期字符串对齐
 * - attrs 透传给 el-date-picker，宽度默认撑满父级表单空间
 */
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    type?: 'date' | 'datetime';
    placeholder?: string;
    clearable?: boolean;
    format?: string;
    valueFormat?: string;
    disabled?: boolean;
  }>(),
  {
    type: 'date',
    placeholder: '请选择日期',
    clearable: true,
    format: 'YYYY-MM-DD',
    valueFormat: 'YYYY-MM-DD',
    disabled: false,
  },
);

const model = defineModel<string | null>({ default: '' });

defineEmits<{
  change: [value: string | null];
  clear: [];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
}>();
</script>

<template>
  <el-date-picker
    v-bind="$attrs"
    v-model="model"
    class="date-picker"
    :type="props.type"
    :placeholder="props.placeholder"
    :clearable="props.clearable"
    :format="props.format"
    :value-format="props.valueFormat"
    :disabled="props.disabled"
    @change="$emit('change', $event)"
    @clear="$emit('clear')"
    @focus="$emit('focus', $event)"
    @blur="$emit('blur', $event)"
  />
</template>

<style scoped>
.date-picker {
  width: 100%;
}
</style>
