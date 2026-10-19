import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  AI_MATERIAL_GENERATION_MODES,
  AI_MATERIAL_STYLE_KEYS,
  type AiMaterialGenerationMode,
  type AiMaterialStyleKey,
} from '../ai-material.constants';
import type { MaterialTaskStatus } from '../entities/material-generation-task.entity';
import type { AiMaterialGenerationStatus } from '../entities/ai-material.entity';

export class CreateAiMaterialDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  prompt: string;

  @IsIn(AI_MATERIAL_STYLE_KEYS)
  styleKey: AiMaterialStyleKey;

  @ValidateIf((dto: CreateAiMaterialDto) => dto.styleKey === 'custom')
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  customStyle?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  aiConfigId: number;

  @IsIn(AI_MATERIAL_GENERATION_MODES)
  @IsOptional()
  generationMode?: AiMaterialGenerationMode;
}

export class UpdateAiMaterialDto extends PartialType(CreateAiMaterialDto) {}

export class QueryAiMaterialDto {
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

  @IsIn([
    'idle',
    'pending',
    'running',
    'storing',
    'succeeded',
    'failed',
    'interrupted',
  ] satisfies AiMaterialGenerationStatus[])
  @IsOptional()
  status?: AiMaterialGenerationStatus;
}

export class GenerateAiMaterialDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;

  @IsUUID()
  requestId: string;
}

export class BatchDeleteAiMaterialDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}

export class QueryMaterialTaskDto {
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

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  materialId?: number;

  @IsIn([
    'pending',
    'running',
    'storing',
    'succeeded',
    'failed',
    'interrupted',
    'unknown',
  ] satisfies MaterialTaskStatus[])
  @IsOptional()
  status?: MaterialTaskStatus;
}
