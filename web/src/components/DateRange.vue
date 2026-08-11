<script setup lang="ts">
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
    format: 'YYYY-MM-DD',
    valueFormat: 'YYYY-MM-DD',
    disabled: false,
  },
);

const model = defineModel<string[]>({ default: () => [] });

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
    v-model="model"
    class="date-range"
    :type="props.type"
    :start-placeholder="props.startPlaceholder"
    :end-placeholder="props.endPlaceholder"
    :range-separator="props.rangeSeparator"
    :clearable="props.clearable"
    :format="props.format"
    :value-format="props.valueFormat"
    :disabled="props.disabled"
    @change="$emit('change', $event || [])"
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
