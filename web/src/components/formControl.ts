import { inject, onBeforeUnmount, type InjectionKey } from 'vue';
import { useFormItem } from 'element-plus';

export interface FormControl {
  readonly prop: string;
  validate: () => true | string;
  clearValidate: () => void;
  /** Synchronize transient editing state after the parent resets its model. */
  reset: () => void;
}

export const FORM_CONTROL_KEY: InjectionKey<{
  register: (control: FormControl) => () => void;
}> = Symbol('form-control');

/** Registers actual mounted controls, including controls rendered through slots. */
export function useFormControl(control: Omit<FormControl, 'prop'>) {
  const context = inject(FORM_CONTROL_KEY, undefined);
  const { form, formItem } = useFormItem();
  const unregister = context?.register({
    ...control,
    get prop() {
      const prop = formItem?.prop;
      return Array.isArray(prop) ? prop.join('.') : prop || '';
    },
  });
  onBeforeUnmount(() => unregister?.());
  return { form, formItem };
}
