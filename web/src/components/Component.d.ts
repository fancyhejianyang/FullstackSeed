import type { InputMode } from './Input.vue';

export type ComponentName =
  | 'Input';

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
}

export type ComponentProps<T extends ComponentName> = ComponentPropsMap[T];
