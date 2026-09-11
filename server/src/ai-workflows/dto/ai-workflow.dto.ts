import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import type { AiWorkflowDefinition } from '../../knowledge-retrieval-configs/workflow-definition';
import { toBoolLike } from '../../common/utils/bool-like';

export class CreateAiWorkflowDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsObject()
  workflowDefinition: AiWorkflowDefinition;

  @IsString()
  @IsNotEmpty()
  @MaxLength(12000)
  aiInstruction: string;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;

  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateAiWorkflowDto extends PartialType(CreateAiWorkflowDto) {}

export class QueryAiWorkflowDto {
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

  @Transform(({ value }) => toBoolLike(value))
  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}

export class BatchDeleteAiWorkflowDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
