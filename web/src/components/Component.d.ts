import type { InputAmountMode } from './InputAmount.vue';
import type { InputValidator } from './inputRules';
import type { CheckboxOption } from './CheckboxGroup.vue';
import type { InputMode } from './Input.vue';
import type { InputNumberMode } from './InputNumber.vue';
import type { SelectOption } from './Select.vue';
import type { UploadResult } from '@/api/upload';

/**
 * 项目封装组件名称登记表。
 *
 * 用途：
 * - 动态表单只允许从这里匹配组件名，避免业务配置写错组件名后运行期才爆错
 * - ComponentPropsMap 记录每个组件可配置的 props，方便后续做表单设计器/字段配置时复用
 * - 新增二次封装组件时，需要同步补充 ComponentName、ComponentPropsMap 和 componentRegistry.ts
 */
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
    uploadRequest?: (file: File) => Promise<UploadResult>;
  };
  UploadImage: {
    accept?: string;
    maxSizeMb?: number;
    disabled?: boolean;
    uploadRequest?: (file: File) => Promise<UploadResult>;
  };
}

export type ComponentProps<T extends ComponentName> = ComponentPropsMap[T];
