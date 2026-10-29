<script setup lang="ts">
/**
 * DateRange — 日期区间/日期时间区间选择组件。
 *
 * 核心能力：
 * - 基于 el-date-picker 的 range 模式，统一默认文案和日期格式
 * - v-model 固定为 string[]，clear/change 空值时回落为空数组
 * - attrs 透传给 el-date-picker，宽度默认撑满父级表单空间
 */
import { computed } from 'vue';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    type?: 'daterange' | 'datetimerange';
    startPlaceholder?: string;
    endPlaceholder?: string;
    rangeSeparator?: string;
    clearable?: boolean;
    format?: string;
    valueFormat?: string;
    disabled?: boolean;
  }>(),
  {
    type: 'daterange',
    startPlaceholder: '开始日期',
    endPlaceholder: '结束日期',
    rangeSeparator: '至',
    clearable: true,
    disabled: false,
  },
);

const model = defineModel<string[]>({ default: () => [] });
const defaultFormat = computed(() =>
  props.type === 'datetimerange' ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD',
);
const displayFormat = computed(() => props.format ?? defaultFormat.value);
const modelFormat = computed(() => props.valueFormat ?? defaultFormat.value);

function normalizeRange(value: string[] | null | undefined): string[] {
  return Array.isArray(value) ? value : [];
}

const pickerValue = computed({
  get: () => normalizeRange(model.value),
  set: (value: string[] | null | undefined) => {
    // Element Plus 清空时返回 null；绑定值与 change 事件保持同一数组契约。
    model.value = normalizeRange(value);
  },
});

defineEmits<{
  change: [value: string[]];
  clear: [];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
}>();
</script>

<template>
  <el-date-picker
    v-bind="$attrs"
    v-model="pickerValue"
    class="date-range"
    :type="props.type"
    :start-placeholder="props.startPlaceholder"
    :end-placeholder="props.endPlaceholder"
    :range-separator="props.rangeSeparator"
    :clearable="props.clearable"
    :format="displayFormat"
    :value-format="modelFormat"
    :disabled="props.disabled"
    @change="$emit('change', normalizeRange($event))"
    @clear="$emit('clear')"
    @focus="$emit('focus', $event)"
    @blur="$emit('blur', $event)"
  />
</template>

<style scoped>
.date-range {
  width: 100%;
}
</style>
