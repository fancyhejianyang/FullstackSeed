import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';

export type MineruAuthMode = 'Bearer' | 'TokenHeader';

export class CreateMineruConfigDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsUrl({ require_tld: false })
  @MaxLength(500)
  baseUrl: string;

  @IsString()
  @IsNotEmpty()
  token: string;

  @IsIn(['Bearer', 'TokenHeader'])
  @IsOptional()
  authMode?: MineruAuthMode;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  modelVersion?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  createTaskPath?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  queryTaskPath?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  @IsOptional()
  pollIntervalSeconds?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  @IsOptional()
  timeoutMinutes?: number;

  @IsBoolean()
  @IsOptional()
  isOcr?: boolean;

  @IsBoolean()
  @IsOptional()
  enableFormula?: boolean;

  @IsBoolean()
  @IsOptional()
  enableTable?: boolean;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}

export class UpdateMineruConfigDto extends PartialType(CreateMineruConfigDto) {}

export class QueryMineruConfigDto {
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
}

export class BatchDeleteMineruConfigDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
