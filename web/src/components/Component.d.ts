import type { InputAmountMode } from './InputAmount.vue';
import type { InputValidator } from './inputRules';
import type { InputMode } from './Input.vue';
import type { InputNumberMode } from './InputNumber.vue';
import type { SelectOption } from './Select.vue';

export type ComponentName =
  | 'Input'
  | 'InputAmount'
  | 'InputEmail'
  | 'InputNumber'
  | 'InputPhone'
  | 'Select'
  | 'SelectMultiple';

export interface ComponentPropsMap {
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
}

export type ComponentProps<T extends ComponentName> = ComponentPropsMap[T];
