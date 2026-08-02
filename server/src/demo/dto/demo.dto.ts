import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsInt,
  IsArray,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import {
  DEMO_CATEGORIES,
  DEMO_STATUSES,
  type DemoStatus,
  type DemoCategory,
} from '../demo.constants';

export class CreateDemoDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsIn(DEMO_CATEGORIES)
  @IsOptional()
  category?: DemoCategory;

  @IsIn(DEMO_STATUSES)
  @IsOptional()
  status?: DemoStatus;
}

export class UpdateDemoDto extends PartialType(CreateDemoDto) {}

export class QueryDemoDto {
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

export class BatchDeleteDemoDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
