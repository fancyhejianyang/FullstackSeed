<script setup lang="ts">
/**
 * DatePicker — 单日期/日期时间选择组件。
 *
 * 核心能力：
 * - 基于 el-date-picker，日期时间类型默认保留时分秒；显式格式优先
 * - v-model 固定使用 string | null，便于与后端 DTO 的日期字符串对齐
 * - attrs 透传给 el-date-picker，宽度默认撑满父级表单空间
 */
import { computed } from 'vue';

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
    disabled: false,
  },
);

const model = defineModel<string | null>({ default: '' });
const defaultFormat = computed(() =>
  props.type === 'datetime' ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD',
);
const displayFormat = computed(() => props.format ?? defaultFormat.value);
const modelFormat = computed(() => props.valueFormat ?? defaultFormat.value);
const pickerValue = computed({
  get: () => model.value,
  set: (value: string | null | undefined) => {
    model.value = value ?? null;
  },
});

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
    v-model="pickerValue"
    class="date-picker"
    :type="props.type"
    :placeholder="props.placeholder"
    :clearable="props.clearable"
    :format="displayFormat"
    :value-format="modelFormat"
    :disabled="props.disabled"
    @change="$emit('change', $event ?? null)"
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
