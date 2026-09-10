import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import {
  AI_FEATURE_CONFIG_TYPES,
  AI_RESPONSE_FORMATS,
  type AiFeatureConfigType,
  type AiResponseFormat,
} from '../ai-feature-config.constants';
import { toBoolLike } from '../../common/utils/bool-like';

export class CreateAiFeatureConfigDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsIn(AI_FEATURE_CONFIG_TYPES)
  featureType: AiFeatureConfigType;

  @ValidateIf(
    (dto: CreateAiFeatureConfigDto) =>
      !(
        (dto.featureType === 'ocr' || dto.featureType === 'documentParse') &&
        dto.useMineru
      ),
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  providerId?: number | null;

  @ValidateIf(
    (dto: CreateAiFeatureConfigDto) =>
      !(
        (dto.featureType === 'ocr' || dto.featureType === 'documentParse') &&
        dto.useMineru
      ),
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  model?: string | null;

  @IsBoolean()
  @IsOptional()
  enableThinking?: boolean;

  @IsObject()
  @IsOptional()
  thinkingParameters?: Record<string, unknown> | null;

  @IsString()
  @IsOptional()
  systemPrompt?: string;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(2)
  @IsOptional()
  temperature?: number;

  @IsIn(AI_RESPONSE_FORMATS)
  @IsOptional()
  responseFormat?: AiResponseFormat;

  @IsBoolean()
  @IsOptional()
  useMineru?: boolean;

  @ValidateIf(
    (dto: CreateAiFeatureConfigDto) =>
      (dto.featureType === 'ocr' || dto.featureType === 'documentParse') &&
      !!dto.useMineru,
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

  @IsIn(AI_FEATURE_CONFIG_TYPES)
  @IsOptional()
  featureType?: AiFeatureConfigType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  providerId?: number;

  @Transform(({ value }) => toBoolLike(value))
  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}

export class BatchDeleteAiFeatureConfigDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
