import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MODEL_FUNCTIONS,
  MODEL_PROTOCOLS,
  PLATFORM_TYPES,
  CATEGORY_LABELS,
  type ModelCategory,
  type ModelFunction,
  type ModelProtocol,
  type PlatformType,
} from '../model-endpoint.constants';

export class CreateModelEndpointDto {
  @IsIn(PLATFORM_TYPES)
  platformType: PlatformType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  modelCode: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  modelName: string;

  @IsIn(MODEL_FUNCTIONS)
  functionType: ModelFunction;

  @IsIn(MODEL_PROTOCOLS)
  protocol: ModelProtocol;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  apiPath: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  taskApiPath?: string;

  @IsIn(['sync', 'async'])
  executionMode: 'sync' | 'async';

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateModelEndpointDto extends PartialType(
  CreateModelEndpointDto,
) {}

export class QueryModelEndpointDto {
  @IsIn(Object.keys(CATEGORY_LABELS))
  @IsOptional()
  category?: ModelCategory;
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  pageSize?: number = 12;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  keyword?: string;

  @IsIn(PLATFORM_TYPES)
  @IsOptional()
  platformType?: PlatformType;

  @IsIn(MODEL_FUNCTIONS)
  @IsOptional()
  functionType?: ModelFunction;

  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class BatchDeleteModelEndpointDto {
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
