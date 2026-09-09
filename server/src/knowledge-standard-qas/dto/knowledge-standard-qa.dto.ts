import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  KNOWLEDGE_STANDARD_QA_STATUSES,
  type KnowledgeStandardQaStatus,
} from '../entities/knowledge-standard-qa.entity';

export class CreateKnowledgeStandardQaDto {
  @IsString()
  @MaxLength(2000)
  question: string;

  @IsArray()
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  @IsOptional()
  aliases?: string[];

  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @IsOptional()
  keywords?: string[];

  @IsString()
  answer: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  retrievalConfigId?: number | null;

  @Type(() => Number)
  @IsInt()
  @Min(-10000)
  @Max(10000)
  @IsOptional()
  priority?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.5)
  @Max(1)
  @IsOptional()
  matchThreshold?: number;

  @IsIn(KNOWLEDGE_STANDARD_QA_STATUSES)
  @IsOptional()
  status?: KnowledgeStandardQaStatus;

  @IsDateString()
  @IsOptional()
  effectiveAt?: string | null;

  @IsDateString()
  @IsOptional()
  expiresAt?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  sourceChatMessageId?: number | null;

  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  sourceChunkIds?: number[];

  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateKnowledgeStandardQaDto extends PartialType(
  CreateKnowledgeStandardQaDto,
) {}

export class QueryKnowledgeStandardQaDto {
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

  @Transform(({ value }) => (value === '' || value == null ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @IsOptional()
  retrievalConfigId?: number;

  @IsIn(KNOWLEDGE_STANDARD_QA_STATUSES)
  @IsOptional()
  status?: KnowledgeStandardQaStatus;
}

export class BatchDeleteKnowledgeStandardQaDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
