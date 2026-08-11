<script setup lang="ts">
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    label?: string;
    disabled?: boolean;
  }>(),
  {
    label: '',
    disabled: false,
  },
);

const model = defineModel<boolean>({ default: false });

defineEmits<{
  change: [value: boolean];
}>();
</script>

<template>
  <el-checkbox
    v-bind="$attrs"
    v-model="model"
    :disabled="props.disabled"
    @change="$emit('change', Boolean($event))"
  >
    {{ props.label }}
  </el-checkbox>
</template>
