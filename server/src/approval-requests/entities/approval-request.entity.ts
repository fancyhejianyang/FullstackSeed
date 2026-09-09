import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export const APPROVAL_REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
] as const;

export type ApprovalRequestStatus = (typeof APPROVAL_REQUEST_STATUSES)[number];

export const APPROVAL_BUSINESS_TYPES = ['standardQa'] as const;

export type ApprovalBusinessType = (typeof APPROVAL_BUSINESS_TYPES)[number];

@Entity('approval_requests')
export class ApprovalRequest extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 40 })
  businessType: ApprovalBusinessType;

  @Index()
  @Column({ type: 'int' })
  businessId: number;

  @Column({ type: 'varchar', length: 200 })
  businessTitle: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: ApprovalRequestStatus;

  @Column({ type: 'int' })
  applicantId: number;

  @Column({ type: 'varchar', length: 120 })
  applicantName: string;

  @Column({ type: 'datetime' })
  submittedAt: Date;

  @Column({ type: 'int', nullable: true })
  reviewerId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  reviewerName: string | null;

  @Column({ type: 'datetime', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  remark: string | null;

  @Column({ type: 'simple-json' })
  contentSnapshot: Record<string, unknown>;
}
