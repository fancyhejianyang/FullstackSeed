<script setup lang="ts">
/**
 * Checkbox — 单个布尔勾选组件。
 *
 * 核心能力：
 * - v-model 固定为 boolean，change 事件也统一转 boolean
 * - 适合“是否推荐、是否启用”等简单开关型表单字段
 * - attrs 透传给 el-checkbox，便于业务侧补充原生能力
 */
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
