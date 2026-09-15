import { PartialType } from '@nestjs/swagger';
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
import { toBoolLike } from '../../common/utils/bool-like';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  productCode: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @IsArray()
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  @IsOptional()
  aliases?: string[];

  @IsString()
  @MaxLength(80)
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class QueryProductDto {
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

export class CreateProductSkuDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsOptional()
  skuCode?: string;

  @IsString()
  @MaxLength(160)
  @IsOptional()
  name?: string;

  @IsObject()
  specifications: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}

export class UpdateProductSkuDto extends PartialType(CreateProductSkuDto) {}

export class QueryProductSkuDto {
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
  productId?: number;

  @Transform(({ value }) => toBoolLike(value))
  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}

export class BatchDeleteProductDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}

export class BatchDeleteProductSkuDto extends BatchDeleteProductDto {}
