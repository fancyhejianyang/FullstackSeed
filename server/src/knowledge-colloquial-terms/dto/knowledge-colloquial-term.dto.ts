import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { toBoolLike } from '../../common/utils/bool-like';
import {
  KNOWLEDGE_COLLOQUIAL_SEMANTIC_TYPES,
  type KnowledgeColloquialSemanticType,
} from '../entities/knowledge-colloquial-term.entity';

export class CreateKnowledgeColloquialTermDto {
  @IsString()
  @MaxLength(160)
  term: string;

  @IsString()
  @MaxLength(500)
  replacement: string;

  @IsIn(KNOWLEDGE_COLLOQUIAL_SEMANTIC_TYPES)
  @IsOptional()
  semanticType?: KnowledgeColloquialSemanticType;

  @IsString()
  @MaxLength(2000)
  semanticDefinition: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  retrievalConfigId?: number | null;

  @IsArray()
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  @IsOptional()
  excludePhrases?: string[];

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}

export class UpdateKnowledgeColloquialTermDto extends PartialType(
  CreateKnowledgeColloquialTermDto,
) {}

export class QueryKnowledgeColloquialTermDto {
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

  @IsIn(KNOWLEDGE_COLLOQUIAL_SEMANTIC_TYPES)
  @IsOptional()
  semanticType?: KnowledgeColloquialSemanticType;

  @Transform(({ value }) =>
    value === '' || value == null ? undefined : Number(value),
  )
  @IsInt()
  @Min(1)
  @IsOptional()
  retrievalConfigId?: number;

  @Transform(({ value }) => toBoolLike(value))
  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}

export class BatchDeleteKnowledgeColloquialTermDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
