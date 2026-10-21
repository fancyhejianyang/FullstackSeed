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
  HotSourceAccess,
  HotSourceKind,
  HotTopicDecision,
  HotTopicMode,
} from '../hot-topic.types';

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
  @IsIn(['new', 'saved', 'ignored', 'selected'])
  decision?: HotTopicDecision;
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
  @IsIn(['douyinHot', 'douyinAccount', 'rss', 'jsonFeed']) kind: HotSourceKind;
  @IsIn(['page', 'search', 'feed']) accessMode: HotSourceAccess;
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  url: string;
  @IsOptional() @IsString() @MaxLength(120) accountName?: string;
  @IsOptional() @IsString() @MaxLength(160) accountId?: string;
  @IsOptional() @IsString() @MaxLength(4000) apiToken?: string;
  @IsOptional() @IsBoolean() clearApiToken?: boolean;
  @IsOptional() @IsBoolean() isEnabled?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}
export class UpdateHotTopicSourceDto extends PartialType(
  SaveHotTopicSourceDto,
) {}

export class HotTopicSourceQueryDto extends HotTopicQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isEnabled?: boolean;
}
export class SaveHotTopicPreferenceDto {
  @IsIn(['aiSearch', 'platform', 'hybrid']) mode: HotTopicMode;
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
  @IsBoolean() scheduleEnabled: boolean;
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) scheduleTime: string;
}
export class SubmitHotTopicRunDto {
  @IsUUID() requestId: string;
  @IsIn(['discover', 'recommend']) action: 'discover' | 'recommend';
}
export class HotTopicDecisionDto {
  @IsIn(['new', 'saved', 'ignored']) decision: 'new' | 'saved' | 'ignored';
}
export class CreateHotTopicArticleDto {
  @IsUUID() requestId: string;
  @IsString() @MaxLength(20000) idea: string;
  @IsOptional() @IsInt() @Min(1) aiConfigId?: number;
  @IsOptional() @IsInt() @Min(1) templateId?: number;
  @IsBoolean() generate: boolean;
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
