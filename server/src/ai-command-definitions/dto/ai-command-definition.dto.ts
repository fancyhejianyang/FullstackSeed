import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { toBoolLike } from '../../common/utils/bool-like';

export class UpdateAiCommandDefinitionDto {
  @IsString()
  @MaxLength(120)
  @IsOptional()
  name?: string;

  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @IsOptional()
  semanticKeywords?: string[];

  @IsString()
  @IsOptional()
  requestSchema?: string;

  @IsString()
  @IsOptional()
  contextBindings?: string;

  @IsBoolean()
  @IsOptional()
  chatCallable?: boolean;

  @IsBoolean()
  @IsOptional()
  requireApproval?: boolean;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;

  @IsString()
  @IsOptional()
  description?: string;
}

export class QueryAiCommandDefinitionDto {
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
  chatCallable?: boolean;

  @Transform(({ value }) => toBoolLike(value))
  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}
