import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { KnowledgeStandardQa } from '../knowledge-standard-qas/entities/knowledge-standard-qa.entity';
import {
  ApproveApprovalRequestDto,
  QueryApprovalRequestDto,
  RejectApprovalRequestDto,
} from './dto/approval-request.dto';
import {
  ApprovalRequest,
  type ApprovalRequestStatus,
} from './entities/approval-request.entity';

@Injectable()
export class ApprovalRequestsService {
  constructor(
    @InjectRepository(ApprovalRequest)
    private readonly approvalRepository: Repository<ApprovalRequest>,
    @InjectRepository(KnowledgeStandardQa)
    private readonly standardQaRepository: Repository<KnowledgeStandardQa>,
  ) {}

  async findAll(query: QueryApprovalRequestDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.businessType ? { businessType: query.businessType } : {}),
    };
    const conditions = query.keyword?.trim()
      ? [
          { ...where, businessTitle: Like(`%${query.keyword.trim()}%`) },
          { ...where, applicantName: Like(`%${query.keyword.trim()}%`) },
          { ...where, reviewerName: Like(`%${query.keyword.trim()}%`) },
        ]
      : where;
    const [list, total] = await this.approvalRepository.findAndCount({
      where: conditions,
      order: { submittedAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total };
  }

  async findOne(id: number) {
    return this.findEntity(id);
  }

  async submitStandardQa(standardQaId: number, applicant: AuthUser) {
    const qa = await this.findStandardQa(standardQaId);
    if (qa.status !== 'draft') {
      throw new BadRequestException('只有草稿状态的标准问答可以提交审批');
    }
    const pending = await this.approvalRepository.findOne({
      where: {
        businessType: 'standardQa',
        businessId: qa.id,
        status: 'pending',
      },
    });
    if (pending) throw new BadRequestException('该标准问答已在审批中');

    qa.status = 'pending';
    await this.standardQaRepository.save(qa);
    const request = this.approvalRepository.create({
      businessType: 'standardQa',
      businessId: qa.id,
      businessTitle: qa.question.slice(0, 200),
      status: 'pending',
      applicantId: applicant.userId,
      applicantName: applicant.username,
      submittedAt: new Date(),
      reviewerId: null,
      reviewerName: null,
      reviewedAt: null,
      remark: null,
      contentSnapshot: this.createStandardQaSnapshot(qa),
    });
    return this.approvalRepository.save(request);
  }

  async approve(
    id: number,
    dto: ApproveApprovalRequestDto,
    reviewer: AuthUser,
  ) {
    return this.review(id, 'approved', dto.remark, reviewer);
  }

  async reject(id: number, dto: RejectApprovalRequestDto, reviewer: AuthUser) {
    return this.review(id, 'rejected', dto.remark, reviewer);
  }

  private async review(
    id: number,
    status: Extract<ApprovalRequestStatus, 'approved' | 'rejected'>,
    remark: string | undefined,
    reviewer: AuthUser,
  ) {
    if (!reviewer.isAdmin) {
      throw new ForbiddenException('只有管理员可以处理审批');
    }
    const request = await this.findEntity(id);
    if (request.status !== 'pending') {
      throw new BadRequestException('该审批已处理，不能重复操作');
    }
    if (request.businessType !== 'standardQa') {
      throw new BadRequestException('暂不支持该审批业务类型');
    }
    const qa = await this.findStandardQa(request.businessId);
    if (qa.status !== 'pending') {
      throw new BadRequestException('审批对象状态已变化，请刷新后重试');
    }

    const now = new Date();
    qa.status = status === 'approved' ? 'published' : 'draft';
    if (status === 'approved') {
      qa.version += 1;
      qa.reviewedAt = now;
    }
    await this.standardQaRepository.save(qa);

    request.status = status;
    request.reviewerId = reviewer.userId;
    request.reviewerName = reviewer.username;
    request.reviewedAt = now;
    request.remark = this.toNullableText(remark);
    return this.approvalRepository.save(request);
  }

  private createStandardQaSnapshot(
    qa: KnowledgeStandardQa,
  ): Record<string, unknown> {
    return {
      question: qa.question,
      answer: qa.answer,
      aliases: qa.aliases ?? [],
      retrievalConfigId: qa.retrievalConfigId,
      effectiveAt: qa.effectiveAt,
      expiresAt: qa.expiresAt,
      sourceChatMessageId: qa.sourceChatMessageId,
      sourceChunkIds: qa.sourceChunkIds ?? [],
    };
  }

  private async findEntity(id: number) {
    const request = await this.approvalRepository.findOne({ where: { id } });
    if (!request) throw new NotFoundException('审批记录不存在');
    return request;
  }

  private async findStandardQa(id: number) {
    const qa = await this.standardQaRepository.findOne({ where: { id } });
    if (!qa) throw new NotFoundException('标准问答不存在');
    return qa;
  }

  private toNullableText(value?: string | null) {
    const text = value?.trim() ?? '';
    return text || null;
  }
}
