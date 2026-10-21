import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PageQueryDto {
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
  pageSize?: number = 10;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  keyword?: string;
}

export class QueryComfyConnectionDto extends PageQueryDto {
  @Transform(({ value }: { value: unknown }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}

export class CreateComfyConnectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  baseUrl: string;

  @IsIn(['none', 'basic', 'bearer'])
  @IsOptional()
  authType?: 'none' | 'basic' | 'bearer' = 'none';

  @IsString()
  @MaxLength(120)
  @IsOptional()
  username?: string;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  secret?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(120000)
  @IsOptional()
  requestTimeoutMs?: number = 15000;

  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(86400)
  @IsOptional()
  taskTimeoutSec?: number = 1800;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  @IsOptional()
  maxConcurrency?: number = 1;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean = true;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean = false;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;
}

export class UpdateComfyConnectionDto extends PartialType(
  CreateComfyConnectionDto,
) {
  @IsBoolean()
  @IsOptional()
  clearSecret?: boolean;
}

export class ComfyBindingOptionDto {
  @IsString()
  @MaxLength(120)
  label: string;

  @IsOptional()
  value: string | number;
}

export class ComfyInputBindingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  key: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label: string;

  @IsIn([
    'text',
    'textarea',
    'number',
    'boolean',
    'select',
    'image',
    'seed',
    'outputPrefix',
  ])
  type: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nodeId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  inputKey: string;

  @IsIn([
    'normal',
    'positivePrompt',
    'negativePrompt',
    'videoMotion',
    'cameraMotion',
  ])
  @IsOptional()
  semanticRole?: string = 'normal';

  @IsBoolean()
  @IsOptional()
  required?: boolean;

  @IsOptional()
  defaultValue?: string | number | boolean | null;

  @IsNumber()
  @IsOptional()
  min?: number;

  @IsNumber()
  @IsOptional()
  max?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComfyBindingOptionDto)
  @IsOptional()
  options?: ComfyBindingOptionDto[];

  @IsString()
  @MaxLength(300)
  @IsOptional()
  hint?: string;
}

export class CreateComfyWorkflowDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  connectionId: number;

  @IsIn(['image', 'video'])
  outputType: 'image' | 'video';

  @IsString()
  @MaxLength(120)
  @IsOptional()
  targetModel?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  apiWorkflow: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComfyInputBindingDto)
  inputBindings: ComfyInputBindingDto[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  outputNodeIds?: string[];

  @IsString()
  @IsOptional()
  dependencyNotes?: string;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean = true;
}

export class UpdateComfyWorkflowDto extends PartialType(
  CreateComfyWorkflowDto,
) {}

export class QueryComfyWorkflowDto extends PageQueryDto {
  @IsString()
  @MaxLength(120)
  @IsOptional()
  targetModel?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  connectionId?: number;

  @IsIn(['image', 'video'])
  @IsOptional()
  outputType?: 'image' | 'video';

  @Transform(({ value }: { value: unknown }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}

export class QueryComfyMaterialDto extends PageQueryDto {
  @IsIn(['input', 'output'])
  @IsOptional()
  sourceType?: 'input' | 'output';

  @IsIn(['image', 'video', 'file'])
  @IsOptional()
  mediaType?: 'image' | 'video' | 'file';
}

export class UpdateComfyMaterialDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  isFavorite?: boolean;
}

export class CreateComfyTaskDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  workflowId: number;

  @IsObject()
  parameters: Record<string, unknown>;

  @IsString()
  @MaxLength(80)
  @IsOptional()
  requestId?: string;
}

export class ComposeComfyWorkflowPromptDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(12000)
  idea: string;

  @IsString()
  @MaxLength(80)
  @IsOptional()
  requestId?: string;
}

export class QueryComfyTaskDto extends PageQueryDto {
  @IsIn([
    'pending',
    'submitting',
    'queued',
    'running',
    'archiving',
    'succeeded',
    'failed',
    'cancelled',
    'unknown',
  ])
  @IsOptional()
  status?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  workflowId?: number;
}

export class BatchIdsDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
