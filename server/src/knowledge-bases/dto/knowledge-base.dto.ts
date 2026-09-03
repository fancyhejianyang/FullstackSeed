import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';

export class CreateKnowledgeBaseDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId: number;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  hitKeywords?: string;

  @IsString()
  @IsOptional()
  colloquialDescription?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  matchPriority?: number;

  @IsIn(['text', 'pdf', 'word', 'image'])
  @IsOptional()
  contentType?: 'text' | 'pdf' | 'word' | 'image';

  @IsString()
  @IsOptional()
  contentText?: string;

  @IsString()
  @IsOptional()
  fileName?: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  fileUrl?: string;

  @IsBoolean()
  @IsOptional()
  containsImages?: boolean;

  @IsBoolean()
  @IsOptional()
  allowFileUpload?: boolean;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}

export class UpdateKnowledgeBaseDto extends PartialType(
  CreateKnowledgeBaseDto,
) {}

export class ParseKnowledgeBaseDto {
  @IsIn(['manual', 'ai', 'ocr', 'mineru'])
  @IsOptional()
  parseMode?: 'manual' | 'ai' | 'ocr' | 'mineru';
}

export class ChunkKnowledgeBaseDto {
  @IsIn(['manual', 'mineru'])
  @IsOptional()
  chunkMode?: 'manual' | 'mineru';
}

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

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  categoryId?: number;
}

export class CreateKnowledgeBaseCategoryDto {
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
}

export class UpdateKnowledgeBaseCategoryDto extends PartialType(
  CreateKnowledgeBaseCategoryDto,
) {}

export class QueryKnowledgeBaseCategoryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  parentId?: number;

  @IsString()
  @IsOptional()
  keyword?: string;
}

export class QueryNextCategoryCodeDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  parentId?: number;
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

  @IsString()
  @IsOptional()
  hitKeywords?: string;

  @IsString()
  @IsOptional()
  colloquialDescription?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  matchPriority?: number;
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

  // 手动分片上下文重叠字段
  @IsString()
  @IsOptional()
  coreContent?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  manualStartOffset?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  manualEndOffset?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  contextBeforeLength?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  contextAfterLength?: number;
}

export class UpdateKnowledgeBaseChunkDto extends PartialType(
  CreateKnowledgeBaseChunkDto,
) {}

export class ManualKnowledgeBaseChunkDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsOptional()
  coreContent?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  manualStartOffset?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  manualEndOffset?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  contextBeforeLength?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  contextAfterLength?: number;
}

export class ReplaceKnowledgeBaseDocumentChunksDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualKnowledgeBaseChunkDto)
  chunks: ManualKnowledgeBaseChunkDto[];
}

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

export class CreateKnowledgeBaseMineruTaskDto {
  @IsUrl({ require_tld: false })
  fileUrl: string;

  @IsString()
  @IsOptional()
  fileName?: string;
}

export class ParseKnowledgeBaseDocumentDto extends CreateKnowledgeBaseMineruTaskDto {
  @IsBoolean()
  @IsOptional()
  waitForResult?: boolean;
}

export class ParseKnowledgeBaseDocumentRequestDto {
  @IsIn(['manual', 'ai', 'ocr', 'mineru'])
  @IsOptional()
  parseMode?: 'manual' | 'ai' | 'ocr' | 'mineru';

  @IsUrl({ require_tld: false })
  @IsOptional()
  fileUrl?: string;

  @IsString()
  @IsOptional()
  fileName?: string;

  @IsBoolean()
  @IsOptional()
  waitForResult?: boolean;
}
