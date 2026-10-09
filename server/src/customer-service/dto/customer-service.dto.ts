import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { toBoolLike } from '../../common/utils/bool-like';

export class SendCustomerMessageDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/)
  clientMessageId: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content: string;
}

export class CustomerHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  beforeMessageId?: number;
}

export class QueryCustomerSessionsDto {
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
  pageSize?: number = 20;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  externalAppId?: number;

  @IsIn(['ai', 'waiting_human', 'human', 'closed'])
  @IsOptional()
  serviceStatus?: 'ai' | 'waiting_human' | 'human' | 'closed';

  @IsIn(['queued', 'running'])
  @IsOptional()
  taskStatus?: 'queued' | 'running';

  @Transform(({ value }) => toBoolLike(value))
  @IsBoolean()
  @IsOptional()
  mine?: boolean;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  keyword?: string;
}
