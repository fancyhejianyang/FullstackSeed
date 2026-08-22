import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import type { KnowledgeRetrievalMode } from '../entities/knowledge-retrieval-config.entity';

export class CreateKnowledgeRetrievalConfigDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsIn(['fullText', 'vector', 'hybrid'])
  @IsOptional()
  retrievalMode?: KnowledgeRetrievalMode;

  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  categoryIds?: number[];

  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  knowledgeBaseIds?: number[];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  topK?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  minScore?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  @IsOptional()
  rrfK?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  textWeight?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  vectorWeight?: number;

  @IsBoolean()
  @IsOptional()
  enableRerank?: boolean;

  @ValidateIf((dto: CreateKnowledgeRetrievalConfigDto) => !!dto.enableRerank)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rerankAiFeatureConfigId?: number | null;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;

  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateKnowledgeRetrievalConfigDto extends PartialType(
  CreateKnowledgeRetrievalConfigDto,
) {}

export class QueryKnowledgeRetrievalConfigDto {
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

  @IsIn(['fullText', 'vector', 'hybrid'])
  @IsOptional()
  retrievalMode?: KnowledgeRetrievalMode;
}

export class BatchDeleteKnowledgeRetrievalConfigDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
