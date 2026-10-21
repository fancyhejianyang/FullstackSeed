import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateKnowledgeStandardQaDto {
  @IsString()
  @MaxLength(2000)
  question: string;

  @IsArray()
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  @IsOptional()
  aliases?: string[];

  @IsString()
  answer: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsDateString()
  @IsOptional()
  effectiveAt?: string | null;

  @IsDateString()
  @IsOptional()
  expiresAt?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  sourceChatMessageId?: number | null;

  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  sourceChunkIds?: number[];
}

export class UpdateKnowledgeStandardQaDto extends PartialType(
  CreateKnowledgeStandardQaDto,
) {}

export class QueryKnowledgeStandardQaDto {
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

  @Transform(({ value }: { value: unknown }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class BatchDeleteKnowledgeStandardQaDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
