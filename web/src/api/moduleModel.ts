import request from '@/utils/request';

export type ModelFieldType =
  | 'number'
  | 'string'
  | 'text'
  | 'boolean'
  | 'datetime'
  | 'enum'
  | 'array'
  | 'relation';

export interface ModuleModelFieldMeta {
  prop: string;
  label: string;
  type: ModelFieldType;
  required: boolean;
  readonly?: boolean;
  unique?: boolean;
  nullable?: boolean;
  defaultValue?: string | number | boolean | null;
  length?: number;
  enumValues?: string[];
  relation?: {
    type: 'many-to-many' | 'many-to-one' | 'one-to-many' | 'one-to-one';
    targetModuleId: string;
    targetModelName: string;
  };
  description?: string;
}

export interface ModuleModelSummary {
  moduleId: string;
  moduleName: string;
  modelName: string;
  tableName: string;
  routePath: string;
  permissionPrefix: string;
}

export interface ModuleModelMeta extends ModuleModelSummary {
  fields: ModuleModelFieldMeta[];
}

export function getModuleModels() {
  return request.get<unknown, ModuleModelSummary[]>('/module-models');
}

export function getModuleModel(moduleId: string) {
  return request.get<unknown, ModuleModelMeta>(`/module-models/${moduleId}`);
}

export function getModuleModelFields(moduleId: string) {
  return request.get<unknown, ModuleModelFieldMeta[]>(
    `/module-models/${moduleId}/fields`,
  );
}
