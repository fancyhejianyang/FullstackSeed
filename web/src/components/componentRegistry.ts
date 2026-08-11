import Checkbox from './Checkbox.vue';
import CheckboxGroup from './CheckboxGroup.vue';
import DatePicker from './DatePicker.vue';
import DateRange from './DateRange.vue';
import InputAmount from './InputAmount.vue';
import Input from './Input.vue';
import InputEmail from './InputEmail.vue';
import InputNumber from './InputNumber.vue';
import InputPhone from './InputPhone.vue';
import Select from './Select.vue';
import SelectMultiple from './SelectMultiple.vue';
import Switch from './Switch.vue';
import UploadFile from './UploadFile.vue';
import UploadImage from './UploadImage.vue';
import type { ComponentName } from './Component';

export const FORM_COMPONENT_MAP = {
  Checkbox,
  CheckboxGroup,
  DatePicker,
  DateRange,
  Input,
  InputAmount,
  InputEmail,
  InputNumber,
  InputPhone,
  Select,
  SelectMultiple,
  Switch,
  UploadFile,
  UploadImage,
} as const satisfies Record<ComponentName, unknown>;

export function getFormComponent(name: ComponentName) {
  return FORM_COMPONENT_MAP[name];
}
