import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateContentArticleDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^(?:https?:\/\/[^\s]+|\/uploads\/[^\s]+)?$/, {
    message: '封面必须是上传图片地址',
  })
  coverUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  idea?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  content?: string;
}

// 编辑发送四个业务字段；version 由客户端透明携带，防止多窗口覆盖。
export class UpdateContentArticleDto extends CreateContentArticleDto {
  @IsInt()
  @Min(1)
  version: number;
}

export class GenerateContentArticleDto {
  @IsString()
  @MaxLength(160)
  @Matches(/\S/, { message: '请输入标题' })
  title: string;

  @IsString()
  @MaxLength(20000)
  @Matches(/\S/, { message: '请先填写想法' })
  idea: string;
}

export class QueryContentArticleDto {
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
  @MaxLength(160)
  @IsOptional()
  keyword?: string;
}

export class BatchDeleteContentArticleDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
