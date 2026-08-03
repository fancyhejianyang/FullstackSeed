import request from '@/utils/request';

export interface LogRecordItem {
  id: number;
  moduleId: string;
  moduleName: string;
  action: string;
  recordId: string;
  operatorId: number | null;
  operatorName: string;
  summary: string | null;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  ip: string;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QueryLogRecordParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  moduleId?: string;
  action?: string;
}

export interface LogRecordListResult {
  list: LogRecordItem[];
  total: number;
}

export interface LogModuleConfigItem {
  moduleId: string;
  moduleName: string;
  modelName: string;
  tableName: string;
  enabled: boolean;
}

export function getLogRecords(params: QueryLogRecordParams) {
  return request.get<unknown, LogRecordListResult>('/log-records', { params });
}

export function getLogModuleConfigs() {
  return request.get<unknown, LogModuleConfigItem[]>(
    '/log-records/module-configs',
  );
}

export function updateLogModuleConfigs(moduleIds: string[]) {
  return request.put<unknown, LogModuleConfigItem[]>(
    '/log-records/module-configs',
    { moduleIds },
  );
}
