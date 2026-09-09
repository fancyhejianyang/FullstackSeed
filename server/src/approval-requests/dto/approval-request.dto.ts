import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  APPROVAL_BUSINESS_TYPES,
  APPROVAL_REQUEST_STATUSES,
  type ApprovalBusinessType,
  type ApprovalRequestStatus,
} from '../entities/approval-request.entity';

export class QueryApprovalRequestDto {
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

  @IsIn(APPROVAL_REQUEST_STATUSES)
  @IsOptional()
  status?: ApprovalRequestStatus;

  @IsIn(APPROVAL_BUSINESS_TYPES)
  @IsOptional()
  businessType?: ApprovalBusinessType;
}

export class ApproveApprovalRequestDto {
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  remark?: string;
}

export class RejectApprovalRequestDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : ''))
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  remark: string;
}
