import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  MaxLength,
  Min,
  ArrayMaxSize,
  IsString,
} from 'class-validator';

export class SaveDashboardDto {
  @IsInt() @Min(0) revision: number;
  @IsArray() @ArrayMaxSize(12) widgets: unknown[];
}
export class QueryDashboardDto {
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([7, 30]) days?: number;
  @IsOptional() @IsString() @MaxLength(80) instanceId?: string;
}
