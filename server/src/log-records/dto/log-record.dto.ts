import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsBoolean,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class QueryLogRecordDto {
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

  @IsString()
  @IsOptional()
  action?: string;
}

export class LogModuleConfigDto {
  @IsString()
  moduleId: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsOptional()
  actions?: string[];
}

export class UpdateLogModuleConfigDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LogModuleConfigDto)
  configs: LogModuleConfigDto[];
}
