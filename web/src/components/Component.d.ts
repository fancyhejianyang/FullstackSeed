import type { InputAmountMode } from './InputAmount.vue';
import type { InputValidator } from './inputRules';
import type { CheckboxOption } from './CheckboxGroup.vue';
import type { InputMode } from './Input.vue';
import type { InputNumberMode } from './InputNumber.vue';
import type { SelectOption } from './Select.vue';

export type ComponentName =
  | 'Checkbox'
  | 'CheckboxGroup'
  | 'DatePicker'
  | 'DateRange'
  | 'Input'
  | 'InputAmount'
  | 'InputEmail'
  | 'InputNumber'
  | 'InputPhone'
  | 'Select'
  | 'SelectMultiple'
  | 'Switch'
  | 'UploadFile'
  | 'UploadImage';

export interface ComponentPropsMap {
  Checkbox: {
    label?: string;
    disabled?: boolean;
  };
  CheckboxGroup: {
    options?: CheckboxOption[];
    disabled?: boolean;
  };
  DatePicker: {
    type?: 'date' | 'datetime';
    placeholder?: string;
    clearable?: boolean;
    format?: string;
    valueFormat?: string;
    disabled?: boolean;
  };
  DateRange: {
    type?: 'daterange' | 'datetimerange';
    startPlaceholder?: string;
    endPlaceholder?: string;
    rangeSeparator?: string;
    clearable?: boolean;
    format?: string;
    valueFormat?: string;
    disabled?: boolean;
  };
  Input: {
    mode?: InputMode;
    placeholder?: string;
    clearable?: boolean;
    trim?: boolean;
    precision?: number;
    min?: number;
    max?: number;
    rows?: number;
    maxlength?: number;
    prefixText?: string;
    suffixText?: string;
  };
  InputNumber: {
    mode?: InputNumberMode;
    placeholder?: string;
    clearable?: boolean;
    precision?: number;
    min?: number;
    max?: number;
    required?: boolean;
    rulesEnabled?: boolean;
    rules?: InputValidator<number | null>[];
    prefixText?: string;
    suffixText?: string;
  };
  InputAmount: {
    mode?: InputAmountMode;
    switchable?: boolean;
    totalAmount?: number | null;
    placeholder?: string;
    clearable?: boolean;
    precision?: number;
    percentPrecision?: number;
    min?: number;
    max?: number;
    required?: boolean;
    rulesEnabled?: boolean;
    rules?: InputValidator<number | null>[];
  };
  InputEmail: {
    placeholder?: string;
    domainPlaceholder?: string;
    domains?: string[];
    clearable?: boolean;
    required?: boolean;
    rulesEnabled?: boolean;
    rules?: InputValidator<string | null>[];
  };
  InputPhone: {
    placeholder?: string;
    clearable?: boolean;
    required?: boolean;
    rulesEnabled?: boolean;
    rules?: InputValidator<string | null>[];
  };
  Select: {
    options?: SelectOption[];
    placeholder?: string;
    disabled?: boolean;
    clearable?: boolean;
    filterable?: boolean;
    debounce?: number;
    virtual?: boolean;
    itemHeight?: number;
    visibleCount?: number;
    notFoundText?: string;
  };
  SelectMultiple: {
    options?: SelectOption[];
    placeholder?: string;
    disabled?: boolean;
    clearable?: boolean;
    filterable?: boolean;
    debounce?: number;
    virtual?: boolean;
    itemHeight?: number;
    visibleCount?: number;
    maxTagCount?: number;
    notFoundText?: string;
  };
  Switch: {
    activeText?: string;
    inactiveText?: string;
    disabled?: boolean;
  };
  UploadFile: {
    accept?: string;
    maxSizeMb?: number;
    disabled?: boolean;
    dragText?: string;
  };
  UploadImage: {
    accept?: string;
    maxSizeMb?: number;
    disabled?: boolean;
  };
}

export type ComponentProps<T extends ComponentName> = ComponentPropsMap[T];
