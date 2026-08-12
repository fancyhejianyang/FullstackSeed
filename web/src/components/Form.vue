<script setup lang="ts">
/**
 * Form — 配置驱动表单组件。
 *
 * 核心能力：
 * - 用 `fields` 描述字段，统一渲染输入、下拉、动态组件和具名插槽兜底
 * - `component` 只允许使用 Component.d.ts 中登记的封装组件名，避免业务页随意拼组件
 * - `componentProps` 支持 ref/computed，内部会在渲染前统一 unref
 * - 暴露 `validate()` / `resetFields()`，页面提交和重置时可直接调用
 * - 复杂字段可设置 `slot: true` 并使用 `#field-字段名` 自定义渲染
 */
import { ref, computed, unref, type Ref } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
import Input, { type InputMode } from './Input.vue';
import {
  FORM_COMPONENT_MAP,
  getFormComponent,
} from './componentRegistry';
import type { ComponentName } from './Component';
type DicValue = string | number | boolean | null;

export interface FormField {
  prop: string;
  label: string;
  type?: 'input' | 'textarea' | 'select';
  component?: ComponentName;
  componentProps?: Record<string, unknown>;
  inputMode?: Extract<InputMode, 'text' | 'password' | 'search'>;
  placeholder?: string;
  options?: { label: string; value: DicValue }[] | Ref<{ label: string; value: DicValue }[]>;
  rows?: number;
  // 是否使用具名插槽 #field-[prop] 自定义渲染
  slot?: boolean;
}

const props = withDefaults(
  defineProps<{
    fields: FormField[];
    rules?: FormRules;
    labelWidth?: string;
    inline?: boolean;
  }>(),
  {
    labelWidth: '80px',
    inline: false,
  },
);

// v-model 绑定表单数据对象
const model = defineModel<Record<string, any>>({ required: true });

defineEmits<{ enter: [] }>();

const formRef = ref<FormInstance>();

/** 将 fields 中可能为 Ref 的 options 统一解包 */
const resolvedFields = computed(() =>
  props.fields.map((field) => ({
    ...field,
    options: unref(field.options),
  })),
);

function validate() {
  return formRef.value?.validate();
}
function resetFields() {
  formRef.value?.resetFields();
}

function getDynamicComponent(field: FormField) {
  return field.component ? getFormComponent(field.component) : null;
}

function getDynamicComponentProps(field: FormField) {
  const componentProps = field.componentProps ?? {};
  // 动态表单常把 options/disabled 写成 computed；这里统一解包，模板无需关心来源。
  return Object.fromEntries(
    Object.entries(componentProps).map(([key, value]) => [key, unref(value)]),
  );
}

defineExpose({ validate, resetFields });
</script>

<template>
  <el-form
    ref="formRef"
    :model="model"
    :rules="props.rules"
    :label-width="props.labelWidth"
    :inline="props.inline"
  >
    <el-form-item
      v-for="field in resolvedFields"
      :key="field.prop"
      :label="field.label"
      :prop="field.prop"
    >
      <!-- 具名插槽兜底：#field-[prop] -->
      <slot v-if="field.slot" :name="`field-${field.prop}`" :model="model" />
      <component
        :is="getDynamicComponent(field)"
        v-else-if="field.component && field.component in FORM_COMPONENT_MAP"
        v-model="model[field.prop]"
        v-bind="getDynamicComponentProps(field)"
        :placeholder="field.placeholder"
      />
      <!-- 下拉 -->
      <el-select
        v-else-if="field.type === 'select'"
        v-model="model[field.prop]"
        :placeholder="field.placeholder || `请选择${field.label}`"
        clearable
      >
        <el-option
          v-for="opt in field.options || []"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
      <!-- 多行文本 -->
      <Input
        v-else-if="field.type === 'textarea'"
        v-model="model[field.prop]"
        mode="textarea"
        :rows="field.rows || 4"
        :placeholder="field.placeholder || `请输入${field.label}`"
      />
      <!-- 默认单行输入 -->
      <Input
        v-else
        v-model="model[field.prop]"
        :mode="field.inputMode || 'text'"
        :placeholder="field.placeholder || `请输入${field.label}`"
        clearable
        @enter="$emit('enter')"
      />
    </el-form-item>
    <!-- 额外操作区（如搜索栏的查询/重置按钮） -->
    <slot name="actions" />
  </el-form>
</template>
