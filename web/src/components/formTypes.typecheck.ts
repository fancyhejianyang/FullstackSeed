// 编译期契约规格：由 vue-tsc 检查，不在应用中导入或执行。
import { computed, ref } from 'vue';
import type { FormField } from './formTypes';

export function checkFormFieldTypes() {
  const fields: FormField[] = [
    { prop: 'title', label: '标题', componentProps: { disabled: ref(false), showWordLimit: true } },
    { prop: 'amount', label: '金额', component: 'InputAmount', componentProps: { min: 10, totalAmount: computed(() => 200), rules: [(value) => value === null || value >= 0 || '金额不能为负数'] } },
    { prop: 'tags', label: '标签', type: 'selectMultiple', componentProps: { maxSelections: 3, validateEvent: false } },
    { prop: 'category', label: '分类', component: 'Select', componentProps: { options: ref([{ value: 'a', text: 'A' }]), validateEvent: false } },
    { prop: 'time', label: '时间', component: 'DatePicker', componentProps: { type: 'datetime' } },
    { prop: 'custom', label: '自定义', slot: true },
  ];

  // @ts-expect-error 数值范围不接受字符串
  const invalidMin: FormField = { prop: 'count', label: '数量', component: 'InputNumber', componentProps: { min: '10' } };
  // @ts-expect-error 文本输入不再登记数字专属属性
  const invalidText: FormField = { prop: 'name', label: '名称', component: 'Input', componentProps: { precision: 2 } };
  // @ts-expect-error 单选不接受多选上限
  const invalidSelect: FormField = { prop: 'kind', label: '类型', type: 'select', componentProps: { maxSelections: 3 } };
  // @ts-expect-error 未知属性不能静默通过配置检查
  const invalidProp: FormField = { prop: 'email', label: '邮箱', component: 'InputEmail', componentProps: { domainz: [] } };
  // @ts-expect-error 模型由 Form 管理
  const invalidModel: FormField = { prop: 'name', label: '名称', component: 'Input', componentProps: { modelValue: '覆盖' } };
  return { fields, invalidMin, invalidText, invalidSelect, invalidProp, invalidModel };
}
