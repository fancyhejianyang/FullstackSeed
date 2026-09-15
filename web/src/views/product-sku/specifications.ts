export interface SpecificationRow {
  key: string;
  value: string;
  originalText?: string;
  originalValue?: unknown;
}

export const specificationPresets: Record<string, string[]> = {
  通用参数: ['品牌', '型号', '尺寸', '重量', '材质', '颜色', '包装清单', '产品用途'],
  空气净化器: ['品牌', '型号', '颗粒物累计净化量等级', '气态污染物累计净化量等级', '高效滤网等级', '净化方式', '空气质量显示', '颗粒物洁净空气量', '气态洁净空气量', '最低档噪声', '电机类型', '额定功率', '额定电压', '包装清单'],
  仪表参数: ['品牌', '型号', '尺寸', '重量', '材质', '温度范围', '额定压力', '过压保护', '测量范围', '精度', '过程连接', '产品用途'],
};

export function specificationRows(value: Record<string, unknown>): SpecificationRow[] {
  return Object.entries(value).map(([key, originalValue]) => {
    const text = typeof originalValue === 'string' ? originalValue : JSON.stringify(originalValue);
    return { key, value: text, originalText: text, originalValue };
  });
}

export function buildSpecifications(rows: SpecificationRow[]): Record<string, unknown> {
  const entries: Array<[string, unknown]> = [];
  const keys = new Set<string>();
  for (const row of rows) {
    const key = row.key.trim();
    const value = row.value.trim();
    if (!value) continue;
    if (!key) throw new Error('请为已填写的参数值填写参数名称');
    if (keys.has(key)) throw new Error(`参数名称重复：${key}`);
    keys.add(key);
    entries.push([key, row.value === row.originalText ? row.originalValue : value]);
  }
  return Object.fromEntries(entries);
}
