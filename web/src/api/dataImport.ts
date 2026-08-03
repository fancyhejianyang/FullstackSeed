import request from '@/utils/request';

export interface DataImportConfigItem {
  id: number;
  moduleId: string;
  moduleName: string;
  modelName: string;
  tableName: string;
  fieldProps: string[];
  fieldLabels: string[];
  templateName: string;
  templateSize: number;
  templateMimeType: string;
  createdAt: string;
  updatedAt: string;
}

export interface DataImportConfigListResult {
  list: DataImportConfigItem[];
  total: number;
}

export interface QueryDataImportConfigParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  moduleId?: string;
}

export interface CreateDataImportConfigPayload {
  moduleId: string;
  fieldProps: string[];
  template: File;
}

export function getDataImportConfigs(params: QueryDataImportConfigParams) {
  return request.get<unknown, DataImportConfigListResult>(
    '/data-import/configs',
    { params },
  );
}

export function createDataImportConfig(data: CreateDataImportConfigPayload) {
  const formData = new FormData();
  formData.append('moduleId', data.moduleId);
  formData.append('fieldProps', JSON.stringify(data.fieldProps));
  formData.append('template', data.template);
  return request.post<unknown, DataImportConfigItem>(
    '/data-import/configs',
    formData,
  );
}
