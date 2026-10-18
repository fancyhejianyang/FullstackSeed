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
  ValidateNested,
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
import { AGENT_MODEL_STRATEGIES } from '../agent-model-routing';
import type { AgentModelRouting } from '../agent-model-routing';
import type {
  AgentMediaModels,
  AgentModelReference,
} from '../agent-media-models';

export class AgentModelReferenceDto implements AgentModelReference {
  @IsInt()
  @Min(1)
  providerId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  model: string;
}

export class AgentMediaModelsDto implements AgentMediaModels {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AgentModelReferenceDto)
  vision: AgentModelReferenceDto | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AgentModelReferenceDto)
  imageGeneration: AgentModelReferenceDto | null;
}

export class AgentModelRoutingDto implements AgentModelRouting {
  @IsIn(AGENT_MODEL_STRATEGIES)
  strategy: AgentModelRouting['strategy'];

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  simpleModels: string[];

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  complexModels: string[];

  @IsInt()
  @Min(3)
  @Max(20)
  maxAttempts: number;

  @IsInt()
  @Min(3)
  @Max(120)
  attemptTimeoutSeconds: number;

  @IsInt()
  @Min(5)
  @Max(3600)
  cooldownSeconds: number;
}

export class CreateAgentAppDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  responsibility: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  instructionMarkdown: string;

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

  @IsOptional()
  @ValidateNested()
  @Type(() => AgentModelRoutingDto)
  modelRouting?: AgentModelRoutingDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AgentMediaModelsDto)
  mediaModels?: AgentMediaModelsDto | null;

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(AGENT_TOOL_KEYS.length)
  @IsIn(AGENT_TOOL_KEYS, { each: true })
  @IsOptional()
  toolKeys?: AgentToolKey[];

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

export class ProbeAgentMediaModelDto {
  @IsInt()
  @Min(1)
  providerId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Matches(/\S/)
  model: string;

  @IsIn(['vision', 'imageGeneration'])
  kind: 'vision' | 'imageGeneration';
}

export class SendAgentMessageDto {
  // 仅兼容旧客户端入参；实际执行由服务端意图识别决定，不信任此字段。
  @IsOptional()
  @IsIn(['chat', 'vision', 'imageGeneration'])
  mode?: 'chat' | 'vision' | 'imageGeneration';

  @IsOptional()
  @IsInt()
  @Min(1)
  imageId?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Matches(/\S/)
  textModel?: string;

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
