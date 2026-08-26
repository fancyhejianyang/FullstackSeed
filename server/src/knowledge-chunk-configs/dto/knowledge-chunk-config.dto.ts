import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import type {
  KnowledgeChunkMode,
  KnowledgeChunkSeparator,
} from '../entities/knowledge-chunk-config.entity';

export class CreateKnowledgeChunkConfigDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsIn(['auto', 'manual'])
  @IsOptional()
  chunkMode?: KnowledgeChunkMode;

  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(10000)
  @IsOptional()
  chunkSize?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3000)
  @IsOptional()
  chunkOverlap?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  @IsOptional()
  timeoutMinutes?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  pdfOcrMaxPages?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  @IsOptional()
  manualMaxChunks?: number;

  @IsIn(['length', 'paragraph'])
  @IsOptional()
  separator?: KnowledgeChunkSeparator;

  @IsBoolean()
  @IsOptional()
  preserveHeading?: boolean;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}

export class UpdateKnowledgeChunkConfigDto extends PartialType(
  CreateKnowledgeChunkConfigDto,
) {}

export class QueryKnowledgeChunkConfigDto {
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

  @IsIn(['auto', 'manual'])
  @IsOptional()
  chunkMode?: KnowledgeChunkMode;
}

export class BatchDeleteKnowledgeChunkConfigDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
