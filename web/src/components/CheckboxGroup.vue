<script setup lang="ts">
import { watch } from 'vue';

defineOptions({ inheritAttrs: false });

export interface CheckboxOption {
  value: string;
  text: string;
  disabled?: boolean;
}

const props = withDefaults(
  defineProps<{
    options?: CheckboxOption[];
    disabled?: boolean;
  }>(),
  {
    options: () => [],
    disabled: false,
  },
);

const model = defineModel<string[]>({ default: () => [] });

defineEmits<{
  change: [value: string[]];
}>();

watch(
  () => model.value,
  (value) => {
    const next = Array.isArray(value) ? value.map((item) => String(item)) : [];
    if (next.length !== value.length || next.some((item, index) => item !== value[index])) {
      model.value = next;
    }
  },
  { immediate: true },
);
</script>

<template>
  <el-checkbox-group
    v-bind="$attrs"
    v-model="model"
    class="checkbox-group"
    :disabled="props.disabled"
    @change="$emit('change', ($event as Array<string | number>).map(String))"
  >
    <el-checkbox
      v-for="item in props.options"
      :key="item.value"
      :label="item.value"
      :disabled="item.disabled"
    >
      {{ item.text }}
    </el-checkbox>
  </el-checkbox-group>
</template>

<style scoped>
.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}
</style>
