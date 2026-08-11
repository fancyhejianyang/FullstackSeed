export type InputValidator<T> = (value: T) => true | string;

export function runInputRules<T>(value: T, rules: InputValidator<T>[]) {
  for (const rule of rules) {
    const result = rule(value);
    if (result !== true) return result;
  }
  return true;
}

export function requiredRule<T>(message = '该字段不能为空'): InputValidator<T> {
  return (value) => {
    if (value === null || value === undefined || value === '') return message;
    if (Array.isArray(value) && value.length === 0) return message;
    return true;
  };
}

export function phoneRule(message = '请输入正确的手机号') {
  return (value: string | null) => {
    if (!value) return true;
    return /^1[3-9]\d{9}$/.test(value) || message;
  };
}

export function numberRangeRule(
  min?: number,
  max?: number,
  message?: string,
): InputValidator<number | null> {
  return (value) => {
    if (value === null || value === undefined) return true;
    if (typeof min === 'number' && value < min) {
      return message || `不能小于 ${min}`;
    }
    if (typeof max === 'number' && value > max) {
      return message || `不能大于 ${max}`;
    }
    return true;
  };
}
