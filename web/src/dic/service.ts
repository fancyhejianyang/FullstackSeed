import { type Ref } from 'vue';
import request from '@/utils/request';

export type DicValue = string | number | boolean | null;

export interface DicItem {
  label: string;
  value: DicValue;
}

export interface StaticDicDefinition {
  isStatic: true;
  items: DicItem[];
}

export interface ApiDicDefinition {
  isStatic: false;
  api: string;
  /** 可选映射字段，未传时默认 label=name、value=id */
  labelKey?: string;
  valueKey?: string;
}

export type DicDefinition = StaticDicDefinition | ApiDicDefinition;

function normalizeDicItems(
  rawList: unknown[],
  labelKey = 'name',
  valueKey = 'id',
): DicItem[] {
  return rawList.map((item) => {
    const record = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;

    const rawLabel = record.label ?? record[labelKey] ?? record[valueKey] ?? '';
    const rawValue = record.value ?? record[valueKey] ?? record[labelKey] ?? '';

    return {
      ...record,
      label: String(rawLabel),
      value: rawValue as DicValue,
    };
  });
}

function resolveArrayPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const maybeList = (payload as Record<string, unknown>).list;
    if (Array.isArray(maybeList)) return maybeList;
  }
  return [];
}

export class DicService {
  private definition: DicDefinition;

  private _items: DicItem[] = [];

  private _labelMap: Map<DicValue, string> = new Map();

  private _valueMap: Map<string, DicValue> = new Map();

  private _itemMap: Map<DicValue, DicItem> = new Map();

  private constructor(definition: DicDefinition) {
    this.definition = definition;
  }

  /** 初始化并写入响应式变量，无需 await */
  static init(definition: DicDefinition, target: Ref<DicItem[]>): void;
  /** 初始化并返回 DicService 实例 */
  static init(definition: DicDefinition): Promise<DicService>;
  static init(definition: DicDefinition, target?: Ref<DicItem[]>): Promise<DicService> | void {
    if (target) {
      const service = new DicService(definition);
      service.refresh().then(() => {
        target.value = service._items;
      });
      return;
    }

    return (async () => {
      const service = new DicService(definition);
      await service.refresh();
      return service;
    })();
  }

  /** 字典完整数据 */
  get items(): DicItem[] {
    return this._items;
  }

  /** 重新拉取并覆盖当前字典 items */
  async refresh(): Promise<DicItem[]> {
    if (this.definition.isStatic) {
      this._items = this.definition.items.map((item) => ({ ...item }));
    } else {
      const payload = await request.get<unknown>(this.definition.api);
      const list = resolveArrayPayload(payload);
      this._items = normalizeDicItems(list, this.definition.labelKey, this.definition.valueKey);
    }

    this._buildMaps();
    return this._items;
  }

  /** 根据 value 取 label，未命中返回空串 */
  getLabel(value: DicValue): string {
    return this._labelMap.get(value) ?? '';
  }

  /** 根据 label 取 value，未命中返回 null */
  getValue(label: string): DicValue | null {
    return this._valueMap.get(label) ?? null;
  }

  /** 根据 value 取完整字典项，未命中返回 null */
  getItem(value: DicValue): DicItem | null {
    return this._itemMap.get(value) ?? null;
  }

  /** 构建 O(1) 查询索引 */
  private _buildMaps(): void {
    this._labelMap.clear();
    this._valueMap.clear();
    this._itemMap.clear();

    for (const item of this._items) {
      this._labelMap.set(item.value, item.label);
      this._valueMap.set(item.label, item.value);
      this._itemMap.set(item.value, item);
    }
  }
}
