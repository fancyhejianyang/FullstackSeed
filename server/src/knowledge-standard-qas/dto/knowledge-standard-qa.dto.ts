import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
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

  @IsString()
  answer: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  retrievalConfigId?: number | null;

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
