import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min,
} from 'class-validator';
import { toBoolLike } from '../../common/utils/bool-like';
import {
  AGENT_ACCESS_SCOPES,
  AGENT_EXECUTION_STATUSES,
  AGENT_TOOL_KEYS,
  type AgentAccessScope,
  type AgentToolKey,
} from '../agent-apps.constants';
import type { AgentExecutionStatus } from '../agent-apps.constants';

export class CreateAgentAppDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  responsibility: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  providerId: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(120, { each: true })
  models: string[];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  workflowId: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @ArrayMaxSize(3)
  @IsIn(AGENT_TOOL_KEYS, { each: true })
  toolKeys: AgentToolKey[];

  @IsIn(AGENT_ACCESS_SCOPES)
  @IsOptional()
  accessScope?: AgentAccessScope;

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(1000)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  allowedUserIds?: number[];

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  writeEnabled?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  maxToolCalls?: number;

  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(300)
  @IsOptional()
  timeoutSeconds?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  maxConcurrentRuns?: number;
}

export class UpdateAgentAppDto extends PartialType(CreateAgentAppDto) {}

export class QueryAgentAppDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  pageSize?: number = 20;

  @IsString()
  @IsOptional()
  keyword?: string;

  @Transform(({ value }) => toBoolLike(value))
  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}

export class BatchDeleteAgentAppDto {
  @IsArray()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}

export class QueryAgentExecutionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  pageSize?: number = 20;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  agentAppId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  userId?: number;

  @IsIn(AGENT_EXECUTION_STATUSES)
  @IsOptional()
  status?: AgentExecutionStatus;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  keyword?: string;
}

export class CreateAgentSessionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  agentAppId: number;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  title?: string;
}

export class QueryAgentSessionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize?: number = 20;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  agentAppId?: number;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  keyword?: string;
}

export class SendAgentMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  content: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  clientMessageId: string;
}

export class UpdateAgentDraftDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;

  @IsObject()
  data: Record<string, unknown>;
}

export class ConfirmAgentDraftDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  idempotencyKey: string;
}
