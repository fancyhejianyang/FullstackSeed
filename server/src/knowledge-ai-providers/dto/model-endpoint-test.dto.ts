import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsUUID,
  Min,
  IsOptional,
  IsString,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';

export class TestModelEndpointDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  providerId: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  model?: string;

  @IsUUID('4')
  requestId: string;

  @IsObject()
  requestBody: Record<string, unknown>;
}
