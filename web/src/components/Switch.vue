<script setup lang="ts">
/**
 * Switch — 布尔开关组件。
 *
 * 核心能力：
 * - v-model 固定为 boolean，change 事件也统一转 boolean
 * - 适合启用/禁用、开启/关闭这类即时状态切换
 * - attrs 透传给 el-switch，业务侧仍可使用 Element Plus 原生扩展能力
 */
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
