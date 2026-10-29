<script setup lang="ts">
/**
 * Form — 配置驱动表单组件。
 *
 * 核心能力：
 * - 用 `fields` 描述字段，统一渲染输入、下拉、动态组件和具名插槽兜底
 * - `type: 'select' | 'selectMultiple'` 默认走项目封装 Select / SelectMultiple
 * - `component` 只允许使用 Component.d.ts 中登记的封装组件名，避免业务页随意拼组件
 * - `componentProps` 支持 ref/computed，内部会在渲染前统一 unref
 * - 暴露 `validate()` / `resetFields()`，页面提交和重置时可直接调用
 * - 复杂字段可设置 `slot: true` 并使用 `#field-字段名` 自定义渲染
 */
import { ref, computed, provide, shallowReactive, unref, type Ref } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
import Input, { type InputMode } from './Input.vue';
import Select, { type SelectOption } from './Select.vue';
import SelectMultiple from './SelectMultiple.vue';
import { FORM_COMPONENT_MAP, getFormComponent } from './componentRegistry';
import type { ComponentName } from './Component';
import { UPLOAD_FORM_KEY, type UploadFormControl } from './uploadForm';
type DicValue = string | number | boolean | null;
type FormOption = {
  label?: string;
  text?: string;
  value: DicValue;
  disabled?: boolean;
};

export interface FormField {
  prop: string;
  label: string;
  type?: 'input' | 'textarea' | 'select' | 'selectMultiple';
  component?: ComponentName;
  componentProps?: Record<string, unknown>;
  inputMode?: Extract<InputMode, 'text' | 'password' | 'search'>;
  placeholder?: string;
  options?: FormOption[] | Ref<FormOption[]>;
  /** 字段下方的辅助说明；支持传入 ref/computed，适合显示随当前值变化的语义提示 */
  hint?: string | Ref<string | undefined>;
  rows?: number;
  /** 两列表单中占用的列数；未填写时占一列 */
  span?: 1 | 2;
  /** 个别复杂字段可让标签显示在控件上方，其余字段保持表单默认布局 */
  labelPosition?: 'top';
  // 是否使用具名插槽 #field-[prop] 自定义渲染
  slot?: boolean;
}

type ResolvedFormField = Omit<FormField, 'options' | 'hint'> & {
  options?: FormOption[];
  hint?: string;
};

const props = withDefaults(
  defineProps<{
    fields: FormField[];
    rules?: FormRules;
    labelWidth?: string;
    labelPosition?: 'left' | 'right' | 'top';
    inline?: boolean;
    columns?: 1 | 2;
  }>(),
  {
    labelWidth: '80px',
    labelPosition: 'right',
    inline: false,
    columns: 1,
  },
);

// v-model 绑定表单数据对象
const model = defineModel<Record<string, any>>({ required: true });

defineEmits<{
  enter: [];
  /** 默认单行输入失焦时透传，载荷为 (字段 prop, 原生事件)，供业务页做自动填充等 */
  blur: [prop: string, event: FocusEvent];
}>();

const formRef = ref<FormInstance>();
type NumberInputRef = { validate: () => true | string };
const numberInputs = new Map<string, NumberInputRef>();
const uploadControls = shallowReactive(new Set<UploadFormControl>());
provide(UPLOAD_FORM_KEY, {
  register(control) {
    uploadControls.add(control);
    return () => uploadControls.delete(control);
  },
});
const uploading = computed(() =>
  [...uploadControls].some((control) => control.uploading.value),
);

function resetUploads() {
  uploadControls.forEach((control) => control.reset());
}

function setNumberInputRef(prop: string, instance: unknown) {
  if (
    instance &&
    typeof instance === 'object' &&
    'validate' in instance &&
    typeof instance.validate === 'function'
  ) {
    numberInputs.set(prop, instance as NumberInputRef);
  } else {
    numberInputs.delete(prop);
  }
}

/** 将 fields 中可能为 Ref 的 options / hint 统一解包 */
const resolvedFields = computed<ResolvedFormField[]>(() =>
  props.fields.map((field) => ({
    ...field,
    options: unref(field.options),
    hint: unref(field.hint),
  })),
);

async function validate() {
  // InputNumber 不再强制截断 min/max；提交必须检查其内置/自定义规则。
  // 仅处理当前实际渲染的数字字段，不改变其它组件或自定义插槽的校验契约。
  const invalidFields: Record<string, { field: string; message: string }[]> =
    {};
  for (const field of resolvedFields.value) {
    if (field.slot || field.component !== 'InputNumber') continue;
    const result = numberInputs.get(field.prop)?.validate();
    if (typeof result === 'string') {
      invalidFields[field.prop] = [{ field: field.prop, message: result }];
    }
  }
  const collectUploadErrors = () => {
    for (const [index, control] of [...uploadControls].entries()) {
      const result = control.validate();
      if (typeof result !== 'string') continue;
      const prop = control.prop || `upload-${index}`;
      invalidFields[prop] = [{ field: prop, message: result }];
    }
  };
  collectUploadErrors();
  let valid: boolean | undefined;
  try {
    valid = await formRef.value?.validate();
  } catch (fields) {
    collectUploadErrors();
    // 保留 Element Plus 原有字段错误，同时附上组件范围错误。
    if (fields && typeof fields === 'object' && !(fields instanceof Error))
      throw { ...fields, ...invalidFields };
    throw fields;
  }
  // 字段规则可能异步执行，返回前再次检查期间新开始的上传。
  collectUploadErrors();
  if (Object.keys(invalidFields).length) throw invalidFields;
  return valid;
}
function resetFields() {
  resetUploads();
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

function toOptionKey(value: DicValue | undefined) {
  return value === null || value === undefined ? '' : String(value);
}

function getSelectOptions(field: ResolvedFormField): SelectOption[] {
  return (field.options ?? []).map((option) => {
    const value = toOptionKey(option.value);
    return {
      value,
      text: option.text ?? option.label ?? `#${value}`,
      disabled: option.disabled,
    };
  });
}

function getSelectModel(field: ResolvedFormField) {
  const value = model.value[field.prop] as DicValue | undefined;
  return toOptionKey(value);
}

function setSelectModel(field: ResolvedFormField, value: string | null) {
  const key = value ?? '';
  if (!key) {
    model.value[field.prop] = '';
    return;
  }

  // Select 内部严格使用字符串；写回表单时恢复老 options 的原始 value 类型。
  const option = (field.options ?? []).find(
    (item) => toOptionKey(item.value) === key,
  );
  model.value[field.prop] = option ? option.value : key;
}

function getSelectMultipleModel(field: ResolvedFormField) {
  const value = model.value[field.prop];
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function setSelectMultipleModel(field: ResolvedFormField, value: string[]) {
  model.value[field.prop] = value.map(String);
}

defineExpose({ validate, resetFields, resetUploads, uploading });
</script>

<template>
  <el-form
    ref="formRef"
    :model="model"
    :rules="props.rules"
    :label-width="props.labelWidth"
    :label-position="props.labelPosition"
    :inline="props.inline"
    :class="{ 'form--two-columns': props.columns === 2 }"
  >
    <el-form-item
      v-for="field in resolvedFields"
      :key="field.prop"
      :label="field.label"
      :prop="field.prop"
      :class="{
        'form__item--span-full': props.columns === 2 && field.span === 2,
        'form__item--label-top': field.labelPosition === 'top',
      }"
    >
      <!-- 具名插槽兜底：#field-[prop] -->
      <slot v-if="field.slot" :name="`field-${field.prop}`" :model="model" />
      <component
        :is="getDynamicComponent(field)"
        v-else-if="field.component && field.component in FORM_COMPONENT_MAP"
        :ref="
          field.component === 'InputNumber'
            ? (instance) => setNumberInputRef(field.prop, instance)
            : undefined
        "
        v-model="model[field.prop]"
        v-bind="getDynamicComponentProps(field)"
        :placeholder="field.placeholder"
      />
      <!-- 单选下拉：默认使用项目封装 Select，并兼容旧 options 的 { label, value } 写法 -->
      <Select
        v-else-if="field.type === 'select'"
        v-bind="getDynamicComponentProps(field)"
        :model-value="getSelectModel(field)"
        :options="getSelectOptions(field)"
        :placeholder="field.placeholder || `请选择${field.label}`"
        @update:model-value="setSelectModel(field, $event)"
      />
      <!-- 多选下拉：绑定值按封装组件契约统一为 string[] -->
      <SelectMultiple
        v-else-if="field.type === 'selectMultiple'"
        v-bind="getDynamicComponentProps(field)"
        :model-value="getSelectMultipleModel(field)"
        :options="getSelectOptions(field)"
        :placeholder="field.placeholder || `请选择${field.label}`"
        @update:model-value="setSelectMultipleModel(field, $event)"
      />
      <!-- 多行文本 -->
      <Input
        v-else-if="field.type === 'textarea'"
        v-bind="getDynamicComponentProps(field)"
        v-model="model[field.prop]"
        mode="textarea"
        :rows="field.rows || 4"
        :placeholder="field.placeholder || `请输入${field.label}`"
      />
      <!-- 默认单行输入 -->
      <Input
        v-else
        v-bind="getDynamicComponentProps(field)"
        v-model="model[field.prop]"
        :mode="field.inputMode || 'text'"
        :placeholder="field.placeholder || `请输入${field.label}`"
        clearable
        @enter="$emit('enter')"
        @blur="$emit('blur', field.prop, $event)"
      />
      <div v-if="field.hint" class="form-field__hint">{{ field.hint }}</div>
    </el-form-item>
    <!-- 额外操作区（如搜索栏的查询/重置按钮） -->
    <slot name="actions" />
  </el-form>
</template>

<style scoped>
.form-field__hint {
  flex-basis: 100%;
  margin-top: 6px;
  color: #909399;
  font-size: 12px;
  line-height: 1.5;
}

.form--two-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  column-gap: 24px;
}

.form--two-columns :deep(.el-form-item) {
  min-width: 0;
  align-self: start;
}

.form--two-columns :deep(.el-form-item__content) {
  min-width: 0;
}

.form--two-columns .form__item--span-full {
  grid-column: 1 / -1;
}

.form__item--label-top {
  display: block;
}

.form__item--label-top :deep(.el-form-item__label) {
  display: flex;
  height: auto;
  padding: 0 12px 8px 0;
  line-height: 20px;
  justify-content: flex-end;
}

.form__item--label-top :deep(.el-form-item__content) {
  display: block;
  width: 100%;
  margin-left: 0 !important;
}

@media (max-width: 760px) {
  .form--two-columns {
    grid-template-columns: minmax(0, 1fr);
  }

  .form--two-columns .form__item--span-full {
    grid-column: auto;
  }
}
</style>
