import request from '@/utils/request';

export interface DataImportConfigItem {
  id: number;
  moduleId: string;
  moduleName: string;
  modelName: string;
  tableName: string;
  fieldProps: string[];
  fieldLabels: string[];
  fieldMappings: DataImportFieldMapping[] | null;
  templateName: string;
  templateSize: number;
  templateMimeType: string;
  createdAt: string;
  updatedAt: string;
}

export interface DataImportFieldMapping {
  templateField: string;
  fieldProp: string;
  fieldLabel: string;
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
  fieldMappings: Array<Pick<DataImportFieldMapping, 'templateField' | 'fieldProp'>>;
  template?: File;
}

export function getDataImportConfigs(params: QueryDataImportConfigParams) {
  return request.get<unknown, DataImportConfigListResult>(
    '/data-import/configs',
    { params },
  );
}

export function createDataImportConfig(data: CreateDataImportConfigPayload) {
  return request.post<unknown, DataImportConfigItem>(
    '/data-import/configs',
    buildDataImportConfigFormData(data),
  );
}

export function updateDataImportConfig(
  id: number,
  data: CreateDataImportConfigPayload,
) {
  return request.patch<unknown, DataImportConfigItem>(
    `/data-import/configs/${id}`,
    buildDataImportConfigFormData(data),
  );
}

export function downloadDataImportTemplate(id: number) {
  return request.get<unknown, Blob>(`/data-import/configs/${id}/template`, {
    responseType: 'blob',
  });
}

function buildDataImportConfigFormData(data: CreateDataImportConfigPayload) {
  const formData = new FormData();
  formData.append('moduleId', data.moduleId);
  formData.append('fieldProps', JSON.stringify(data.fieldProps));
  formData.append('fieldMappings', JSON.stringify(data.fieldMappings));
  if (data.template) {
    formData.append('template', data.template);
  }
  return formData;
}
