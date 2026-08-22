import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import {
  AI_FEATURE_TYPES,
  AI_RESPONSE_FORMATS,
  type AiFeatureType,
  type AiResponseFormat,
} from '../ai-feature-config.constants';

export class CreateAiFeatureConfigDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsIn(AI_FEATURE_TYPES)
  featureType: AiFeatureType;

  @ValidateIf(
    (dto: CreateAiFeatureConfigDto) =>
      !(dto.featureType === 'ocr' && dto.useMineru),
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  providerId?: number | null;

  @ValidateIf(
    (dto: CreateAiFeatureConfigDto) =>
      !(dto.featureType === 'ocr' && dto.useMineru),
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  model?: string | null;

  @IsString()
  @IsOptional()
  systemPrompt?: string;

  @IsString()
  @IsOptional()
  rules?: string;

  @IsIn(AI_RESPONSE_FORMATS)
  @IsOptional()
  responseFormat?: AiResponseFormat;

  @IsBoolean()
  @IsOptional()
  useMineru?: boolean;

  @ValidateIf(
    (dto: CreateAiFeatureConfigDto) =>
      dto.featureType === 'ocr' && !!dto.useMineru,
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  mineruConfigId?: number | null;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;

  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateAiFeatureConfigDto extends PartialType(
  CreateAiFeatureConfigDto,
) {}

export class QueryAiFeatureConfigDto {
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

  @IsIn(AI_FEATURE_TYPES)
  @IsOptional()
  featureType?: AiFeatureType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  providerId?: number;
}

export class BatchDeleteAiFeatureConfigDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
