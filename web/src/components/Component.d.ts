import type { InputMode } from './Input.vue';
import type { InputNumberMode } from './InputNumber.vue';
import type { InputValidator } from './inputRules';

export type ComponentName =
  | 'Input'
  | 'InputNumber'
  | 'InputPhone';

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
  InputPhone: {
    placeholder?: string;
    clearable?: boolean;
    required?: boolean;
    rulesEnabled?: boolean;
    rules?: InputValidator<string | null>[];
  };
}

export type ComponentProps<T extends ComponentName> = ComponentPropsMap[T];
