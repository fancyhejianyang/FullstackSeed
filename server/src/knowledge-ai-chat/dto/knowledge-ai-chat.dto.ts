import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { toBoolLike } from '../../common/utils/bool-like';

export class AskKnowledgeAiDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  providerId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  aiFeatureConfigId?: number;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  model?: string;

  @IsString()
  @IsNotEmpty()
  question: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  retrievalConfigId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  sessionId?: number;

  @IsString()
  @IsOptional()
  systemPrompt?: string;

  @IsString()
  @IsOptional()
  title?: string;
}

export class InitKnowledgeAiChatSessionDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  model?: string;

  @IsString()
  @IsOptional()
  title?: string;
}

export class QueryKnowledgeAiChatSessionDto {
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

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  providerId?: number;

  @Transform(({ value }) => toBoolLike(value))
  @IsBoolean()
  @IsOptional()
  isSuccess?: boolean;
}

export class BatchDeleteKnowledgeAiChatSessionDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
