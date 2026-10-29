import type { Ref } from 'vue';
import type { ComponentName, ComponentProps } from './Component';
import type { InputMode } from './Input.vue';

export type FormOptionValue = string | number | boolean | null;

export interface FormOption {
  label?: string;
  text?: string;
  value: FormOptionValue;
  disabled?: boolean;
}

/** 按属性解包，与 Form 的运行时 unref 行为保持一致。 */
export type ReactiveComponentProps<T extends ComponentName> = {
  [K in keyof ComponentProps<T>]?: ComponentProps<T>[K] | Ref<ComponentProps<T>[K]>;
};

interface FormFieldBase {
  prop: string;
  label: string;
  inputMode?: Extract<InputMode, 'text' | 'password' | 'search'>;
  placeholder?: string;
  options?: FormOption[] | Ref<FormOption[]>;
  hint?: string | Ref<string | undefined>;
  rows?: number;
  span?: 1 | 2;
  labelPosition?: 'top';
  slot?: boolean;
}

type DynamicField = {
  [K in ComponentName]: {
    component: K;
    componentProps?: ReactiveComponentProps<K>;
    type?: 'input' | 'textarea' | 'select' | 'selectMultiple';
  };
}[ComponentName];

type BuiltinField =
  | { component?: undefined; type?: 'input' | 'textarea'; componentProps?: ReactiveComponentProps<'Input'> }
  | { component?: undefined; type: 'select'; componentProps?: ReactiveComponentProps<'Select'> }
  | { component?: undefined; type: 'selectMultiple'; componentProps?: ReactiveComponentProps<'SelectMultiple'> };

/** component/type 决定可用属性，防止合法属性被传给错误的控件。 */
export type FormField = FormFieldBase & (DynamicField | BuiltinField);

type ResolveField<T> = T extends FormField
  ? Omit<T, 'options' | 'hint'> & { options?: FormOption[]; hint?: string }
  : never;
export type ResolvedFormField = ResolveField<FormField>;
