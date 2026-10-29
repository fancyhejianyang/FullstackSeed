import type { InputProps } from 'element-plus';
import type { AriaAttributes, InputHTMLAttributes } from 'vue';
import type Checkbox from './Checkbox.vue';
import type CheckboxGroup from './CheckboxGroup.vue';
import type DatePicker from './DatePicker.vue';
import type DateRange from './DateRange.vue';
import type Input from './Input.vue';
import type InputAmount from './InputAmount.vue';
import type InputEmail from './InputEmail.vue';
import type InputNumber from './InputNumber.vue';
import type InputPhone from './InputPhone.vue';
import type Select from './Select.vue';
import type SelectMultiple from './SelectMultiple.vue';
import type Switch from './Switch.vue';
import type UploadFile from './UploadFile.vue';
import type UploadImage from './UploadImage.vue';

/** 配置只登记控件 props；模型和事件由 Form 管理，不允许覆盖。 */
type ConfigProps<T extends abstract new (...args: any[]) => any> = {
  [K in keyof InstanceType<T>['$props'] as K extends
    | `on${string}`
    | `${string}Modifiers`
    | 'modelValue'
    | 'key'
    | 'ref'
    | 'ref_for'
    | 'ref_key'
    ? never : K]?: InstanceType<T>['$props'][K];
};

/** 文本类封装明确透传的常用 Element Plus 属性，不开放任意字符串键。 */
type InputAttrs = Partial<Pick<InputProps,
  | 'disabled' | 'readonly' | 'autocomplete' | 'autofocus'
  | 'maxlength' | 'minlength' | 'showWordLimit' | 'resize'
  | 'autosize' | 'name' | 'tabindex' | 'validateEvent'
  | 'prefixIcon' | 'suffixIcon'
>> & Pick<InputHTMLAttributes, 'spellcheck' | 'inputmode'> & AriaAttributes;

/**
 * 从实际组件声明派生配置类型，新增 props 无需维护第二份手写定义。
 * 新增组件时仍需同步 componentRegistry.ts 白名单。
 */
export interface ComponentPropsMap {
  Checkbox: ConfigProps<typeof Checkbox>;
  CheckboxGroup: ConfigProps<typeof CheckboxGroup>;
  DatePicker: ConfigProps<typeof DatePicker>;
  DateRange: ConfigProps<typeof DateRange>;
  Input: ConfigProps<typeof Input> & InputAttrs;
  InputNumber: ConfigProps<typeof InputNumber> & InputAttrs;
  InputAmount: ConfigProps<typeof InputAmount> & InputAttrs;
  InputEmail: ConfigProps<typeof InputEmail> & InputAttrs;
  InputPhone: ConfigProps<typeof InputPhone> & InputAttrs;
  Select: ConfigProps<typeof Select>;
  SelectMultiple: ConfigProps<typeof SelectMultiple>;
  Switch: ConfigProps<typeof Switch>;
  UploadFile: Omit<ConfigProps<typeof UploadFile>, 'name' | 'content'>;
  UploadImage: ConfigProps<typeof UploadImage>;
}

export type ComponentName = keyof ComponentPropsMap;
export type ComponentProps<T extends ComponentName> = ComponentPropsMap[T];
