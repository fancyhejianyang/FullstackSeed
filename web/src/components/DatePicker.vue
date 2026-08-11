<script setup lang="ts">
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
