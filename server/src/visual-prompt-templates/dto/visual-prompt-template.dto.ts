import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SaveVisualPromptTemplateDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @IsIn(['image', 'video']) mediaType: 'image' | 'video';
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  targetModel?: string;
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  sourcePlatform?: string;
  @Type(() => Number) @IsInt() @Min(1) aiConfigId: number;
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  sourcePrompt: string;
  @Transform(trim)
  @IsString()
  @MaxLength(12000)
  @IsOptional()
  sourceNegativePrompt?: string;
  @Transform(trim)
  @IsString()
  @MaxLength(20000)
  @IsOptional()
  positiveTemplate?: string;
  @Transform(trim)
  @IsString()
  @MaxLength(12000)
  @IsOptional()
  negativeTemplate?: string;
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  @IsOptional()
  styleSummary?: string;
  @Transform(trim)
  @IsString()
  @MaxLength(8000)
  @IsOptional()
  modelRules?: string;
  @IsArray() @IsString({ each: true }) @IsOptional() variables?: string[];
  @IsBoolean() @IsOptional() isEnabled?: boolean = true;
}

export class QueryVisualPromptTemplateDto {
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page?: number = 1;
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize?: number = 10;
  @IsString() @MaxLength(120) @IsOptional() keyword?: string;
  @IsIn(['image', 'video']) @IsOptional() mediaType?: 'image' | 'video';
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  targetModel?: string;
}

export class ComposeVisualPromptDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(12000) idea: string;
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  targetModel?: string;
}

export class BatchDeleteVisualPromptTemplateDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
