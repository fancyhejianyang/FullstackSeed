<script setup lang="ts">
import { ref, computed, unref, type Ref } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
type DicValue = string | number | boolean | null;

export interface ProFormField {
  prop: string;
  label: string;
  type?: 'input' | 'textarea' | 'select';
  placeholder?: string;
  options?: { label: string; value: DicValue }[] | Ref<{ label: string; value: DicValue }[]>;
  rows?: number;
  // 是否使用具名插槽 #field-[prop] 自定义渲染
  slot?: boolean;
}

const props = withDefaults(
  defineProps<{
    fields: ProFormField[];
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
      <el-input
        v-else-if="field.type === 'textarea'"
        v-model="model[field.prop]"
        type="textarea"
        :rows="field.rows || 4"
        :placeholder="field.placeholder || `请输入${field.label}`"
      />
      <!-- 默认单行输入 -->
      <el-input
        v-else
        v-model="model[field.prop]"
        :placeholder="field.placeholder || `请输入${field.label}`"
        clearable
        @keyup.enter="$emit('enter')"
      />
    </el-form-item>
    <!-- 额外操作区（如搜索栏的查询/重置按钮） -->
    <slot name="actions" />
  </el-form>
</template>
