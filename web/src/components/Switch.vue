<script setup lang="ts">
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    activeText?: string;
    inactiveText?: string;
    disabled?: boolean;
  }>(),
  {
    activeText: '',
    inactiveText: '',
    disabled: false,
  },
);

const model = defineModel<boolean>({ default: false });

defineEmits<{
  change: [value: boolean];
}>();
</script>

<template>
  <el-switch
    v-bind="$attrs"
    v-model="model"
    :active-text="props.activeText"
    :inactive-text="props.inactiveText"
    :disabled="props.disabled"
    @change="$emit('change', Boolean($event))"
  />
</template>
