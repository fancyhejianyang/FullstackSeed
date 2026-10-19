import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  IsNotEmpty,
  MaxLength,
  Min,
  Max,
  IsOptional,
} from 'class-validator';
export class SaveContentTemplateDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  instruction: string;
}
export class QueryContentTemplateDto {
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
  @MaxLength(120)
  @IsOptional()
  keyword?: string;
}
