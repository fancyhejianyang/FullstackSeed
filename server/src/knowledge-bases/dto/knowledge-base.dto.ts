import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';

export class CreateKnowledgeBaseDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsIn(['text', 'file', 'mixed'])
  @IsOptional()
  contentType?: 'text' | 'file' | 'mixed';

  @IsBoolean()
  @IsOptional()
  containsImages?: boolean;

  @IsBoolean()
  @IsOptional()
  allowFileUpload?: boolean;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  sort?: number;
}

export class UpdateKnowledgeBaseDto extends PartialType(CreateKnowledgeBaseDto) {}

export class QueryKnowledgeBaseDto {
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

export class CreateKnowledgeBaseCategoryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  knowledgeBaseId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  parentId?: number | null;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  sort?: number;
}

export class UpdateKnowledgeBaseCategoryDto extends PartialType(
  CreateKnowledgeBaseCategoryDto,
) {}

export class QueryKnowledgeBaseCategoryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  knowledgeBaseId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  parentId?: number;

  @IsString()
  @IsOptional()
  keyword?: string;
}

export class CreateKnowledgeBaseDocumentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  knowledgeBaseId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  categoryId?: number | null;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  sourceType?: string;

  @IsString()
  @IsOptional()
  sourceName?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  sort?: number;
}

export class UpdateKnowledgeBaseDocumentDto extends PartialType(
  CreateKnowledgeBaseDocumentDto,
) {}

export class QueryKnowledgeBaseDocumentDto {
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

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  knowledgeBaseId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  categoryId?: number;

  @IsString()
  @IsOptional()
  keyword?: string;
}

export class CreateKnowledgeBaseChunkDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  documentId: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  chunkIndex?: number;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  tokenCount?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  sort?: number;
}

export class UpdateKnowledgeBaseChunkDto extends PartialType(
  CreateKnowledgeBaseChunkDto,
) {}

export class QueryKnowledgeBaseChunkDto {
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

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  documentId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  knowledgeBaseId?: number;

  @IsString()
  @IsOptional()
  keyword?: string;
}

export class BatchDeleteKnowledgeBaseDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
