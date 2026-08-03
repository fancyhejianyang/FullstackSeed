import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

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
}

export class CreateDataImportConfigDto {
  @IsString()
  moduleId: string;

  @IsString()
  fieldProps: string;
}
