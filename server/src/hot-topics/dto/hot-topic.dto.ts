import { Transform, Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  ConfigurableHotSourceKind,
  HotTopicDecision,
} from '../hot-topic.types';

function normalizeBoolean(value: unknown): unknown {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return value;
}

export class HotTopicQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 10;
  @IsOptional() @IsString() @MaxLength(200) keyword?: string;
  @IsOptional()
  @IsIn(['new', 'ignored', 'selected', 'all'])
  decision?: HotTopicDecision | 'all';
  @IsOptional()
  @IsIn(['unreviewed', 'high', 'medium', 'low'])
  level?: HotTopic['recommendationLevel'];
  @IsOptional()
  @IsIn(['pending', 'running', 'succeeded', 'partial', 'failed', 'interrupted'])
  status?: string;
}
import type { HotTopic } from '../entities/hot-topic.entity';

export class SaveHotTopicSourceDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @IsIn(['douyinHot', 'weiboHot', 'neteaseNews'])
  kind: ConfigurableHotSourceKind;
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  url: string;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeBoolean(value))
  @IsBoolean()
  isEnabled?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}
export class UpdateHotTopicSourceDto extends PartialType(
  SaveHotTopicSourceDto,
) {}

export class HotTopicSourceQueryDto extends HotTopicQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeBoolean(value))
  @IsBoolean()
  isEnabled?: boolean;
}
export class SaveHotTopicPreferenceDto {
  @IsOptional() @IsInt() @Min(1) aiConfigId?: number | null;
  @IsArray()
  @ArrayMaxSize(5)
  @IsInt({ each: true })
  @Min(1, { each: true })
  sourceIds: number[];
  @IsString() @MaxLength(4000) interests: string;
  @IsString() @MaxLength(2000) exclusions: string;
  @IsString() @MaxLength(1000) audience: string;
  @IsString() @MaxLength(1000) writingStyle: string;
  @IsInt() @Min(1) @Max(168) lookbackHours: number;
  @IsInt() @Min(1) @Max(30) maxResults: number;
  @Transform(({ value }: { value: unknown }) => normalizeBoolean(value))
  @IsBoolean()
  scheduleEnabled: boolean;
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) scheduleTime: string;
}
export class SubmitHotTopicRunDto {
  @IsUUID() requestId: string;
  @IsIn(['discover', 'recommend']) action: 'discover' | 'recommend';
}
export class HotTopicDecisionDto {
  @IsIn(['new', 'ignored']) decision: 'new' | 'ignored';
}
export class CreateHotTopicArticleDto {
  @IsUUID() requestId: string;
  @IsString() @MaxLength(20000) idea: string;
  @IsOptional() @IsInt() @Min(1) aiConfigId?: number;
  @IsOptional() @IsInt() @Min(1) templateId?: number;
  @Transform(({ value }: { value: unknown }) => normalizeBoolean(value))
  @IsBoolean()
  generate: boolean;
}
export class BatchDeleteHotTopicsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
