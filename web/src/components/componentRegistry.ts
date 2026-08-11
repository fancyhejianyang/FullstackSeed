import InputAmount from './InputAmount.vue';
import Input from './Input.vue';
import InputNumber from './InputNumber.vue';
import InputPhone from './InputPhone.vue';
import Select from './Select.vue';
import SelectMultiple from './SelectMultiple.vue';
import type { ComponentName } from './Component';

export const FORM_COMPONENT_MAP = {
  Input,
  InputAmount,
  InputNumber,
  InputPhone,
  Select,
  SelectMultiple,
} as const satisfies Record<ComponentName, unknown>;

export function getFormComponent(name: ComponentName) {
  return FORM_COMPONENT_MAP[name];
}
