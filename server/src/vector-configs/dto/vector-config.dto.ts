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
  MaxLength,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';

export type VectorDbType = 'chroma';

export class CreateVectorConfigDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsIn(['chroma'])
  @IsOptional()
  vectorDbType?: VectorDbType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  providerId?: number;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  model?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  embeddingDimension?: number;

  @IsUrl({ require_tld: false })
  @MaxLength(500)
  chromaUrl: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  collectionName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  tenant?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  database?: string;

  @IsString()
  @IsOptional()
  token?: string;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}

export class UpdateVectorConfigDto extends PartialType(CreateVectorConfigDto) {}

export class QueryVectorConfigDto {
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

export class BatchDeleteVectorConfigDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
