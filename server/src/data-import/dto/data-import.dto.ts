import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export const DATA_IMPORT_TEMPLATE_TYPES = ['xlsx', 'xls', 'csv'] as const;
export type DataImportTemplateType =
  (typeof DATA_IMPORT_TEMPLATE_TYPES)[number];

export class QueryDataImportConfigDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  pageSize?: number = 10;

  @IsString()
  @IsOptional()
  keyword?: string;

  @IsString()
  @IsOptional()
  moduleId?: string;

  @IsIn(DATA_IMPORT_TEMPLATE_TYPES)
  @IsOptional()
  templateType?: DataImportTemplateType;
}

export class CreateDataImportConfigDto {
  @IsString()
  moduleId: string;

  @IsString()
  fieldProps: string;

  @IsString()
  @IsOptional()
  fieldMappings?: string;
}
