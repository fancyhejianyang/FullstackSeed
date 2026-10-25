import { Type } from 'class-transformer';
import { IsInt, IsObject, IsUUID, Min } from 'class-validator';

export class TestModelEndpointDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  providerId: number;

  @IsUUID('4')
  requestId: string;

  @IsObject()
  requestBody: Record<string, unknown>;
}
