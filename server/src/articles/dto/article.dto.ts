import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import {
  ARTICLE_CATEGORIES,
  ARTICLE_STATUSES,
  type ArticleStatus,
  type ArticleCategory,
} from '../articles.constants';

export class CreateArticleDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsIn(ARTICLE_CATEGORIES)
  @IsOptional()
  category?: ArticleCategory;

  @IsIn(ARTICLE_STATUSES)
  @IsOptional()
  status?: ArticleStatus;
}

export class UpdateArticleDto extends PartialType(CreateArticleDto) {}

export class QueryArticleDto {
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
