export interface SpecificationRow {
  name: string;
  label: string;
  builtin?: boolean;
  value: string;
  originalText?: string;
  originalValue?: unknown;
}

export const commonSpecifications = [
  { name: 'brand', label: '品牌' },
  { name: 'model', label: '型号' },
  { name: 'dimensions', label: '尺寸' },
  { name: 'weight', label: '质量' },
  { name: 'color', label: '颜色' },
];

export function specificationRows(value: Record<string, unknown>): SpecificationRow[] {
  const rows: SpecificationRow[] = commonSpecifications.map((item) => ({ ...item, value: '', builtin: true }));
  const filled = new Set<string>();
  for (const [name, raw] of Object.entries(value)) {
    const structured = raw !== null && typeof raw === 'object' && 'label' in raw && typeof raw.label === 'string' && 'value' in raw;
    const label = structured ? raw.label as string : name;
    const originalValue = structured ? raw.value : raw;
    const text = typeof originalValue === 'string' ? originalValue : JSON.stringify(originalValue);
    const builtin = rows.find((item) => item.builtin && (item.name === name || item.label === name || (item.name === 'weight' && name === '重量')));
    if (builtin && !filled.has(builtin.name)) {
      Object.assign(builtin, { value: text, originalText: text, originalValue });
      filled.add(builtin.name);
    } else {
      rows.push({ name, label, value: text, originalText: text, originalValue });
    }
  }
  return rows;
}

export function buildSpecifications(rows: SpecificationRow[]): Record<string, unknown> {
  const entries: Array<[string, unknown]> = [];
  const keys = new Set<string>();
  for (const row of rows) {
    const key = row.name.trim();
    const label = row.label.trim();
    const value = row.value.trim();
    if (row.builtin && !value) continue;
    if (!row.builtin && !key && !label && !value) continue;
    if (!key || !label || !value) throw new Error('自定义参数的 Name、Label、Value 均需填写');
    if (!row.builtin && commonSpecifications.some((item) => item.name.toLowerCase() === key.toLowerCase())) throw new Error(`Name 为内置参数保留：${key}`);
    if (keys.has(key.toLowerCase())) throw new Error(`参数 Name 重复：${key}`);
    keys.add(key.toLowerCase());
    entries.push([key, { label, value: row.value === row.originalText ? row.originalValue : value }]);
  }
  return Object.fromEntries(entries);
}

export function formatSpecifications(specifications: Record<string, unknown>): string {
  return Object.entries(specifications ?? {}).map(([name, raw]) => {
    const structured = raw !== null && typeof raw === 'object' && 'label' in raw && typeof raw.label === 'string' && 'value' in raw;
    const label = structured ? raw.label : name;
    const value = structured ? raw.value : raw;
    return `${label}：${typeof value === 'string' ? value : JSON.stringify(value)}`;
  }).join('；') || '-';
}
