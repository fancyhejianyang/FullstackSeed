import { Transform, Type } from 'class-transformer';
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
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { toBoolLike } from '../../common/utils/bool-like';
import {
  KNOWLEDGE_ROUTING_MATCH_MODES,
  KNOWLEDGE_ROUTING_RULE_TYPES,
  type KnowledgeRoutingMatchMode,
  type KnowledgeRoutingRuleType,
} from '../entities/knowledge-routing-rule.entity';

export class CreateKnowledgeRoutingRuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  term: string;

  @IsIn(KNOWLEDGE_ROUTING_RULE_TYPES)
  @IsOptional()
  ruleType?: KnowledgeRoutingRuleType;

  @IsIn(KNOWLEDGE_ROUTING_MATCH_MODES)
  @IsOptional()
  matchMode?: KnowledgeRoutingMatchMode;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(-1)
  @Max(1)
  @IsOptional()
  weight?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  retrievalConfigId: number;

  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  knowledgeBaseIds?: number[];

  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  documentIds?: number[];

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;

  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateKnowledgeRoutingRuleDto extends PartialType(
  CreateKnowledgeRoutingRuleDto,
) {}

export class QueryKnowledgeRoutingRuleDto {
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

  @IsIn(KNOWLEDGE_ROUTING_RULE_TYPES)
  @IsOptional()
  ruleType?: KnowledgeRoutingRuleType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  retrievalConfigId?: number;

  @Transform(({ value }) => toBoolLike(value))
  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}

export class BatchDeleteKnowledgeRoutingRuleDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
