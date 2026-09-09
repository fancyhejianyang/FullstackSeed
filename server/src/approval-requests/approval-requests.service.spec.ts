import type { Repository } from 'typeorm';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { KnowledgeStandardQa } from '../knowledge-standard-qas/entities/knowledge-standard-qa.entity';
import { ApprovalRequestsService } from './approval-requests.service';
import { ApprovalRequest } from './entities/approval-request.entity';

const applicant: AuthUser = {
  userId: 7,
  username: 'editor',
  isAdmin: false,
  roles: [],
  permissions: [],
};

const administrator: AuthUser = {
  userId: 1,
  username: 'root',
  isAdmin: true,
  roles: ['admin'],
  permissions: [],
};

function createStandardQa(status: KnowledgeStandardQa['status'] = 'draft') {
  return {
    id: 12,
    question: '公司的年假制度是什么？',
    answer: '按员工工龄享受对应年假天数。',
    aliases: ['年假有几天？'],
    keywords: ['年假', '制度'],
    retrievalConfigId: null,
    priority: 0,
    matchThreshold: 0.88,
    status,
    effectiveAt: null,
    expiresAt: null,
    sourceChatMessageId: 99,
    sourceChunkIds: [10, 11],
    version: 1,
    reviewedAt: null,
    hitCount: 0,
    lastHitAt: null,
    description: null,
  } as KnowledgeStandardQa;
}

describe('ApprovalRequestsService', () => {
  const approvalRepository = {
    findOne: jest.fn(),
    create: jest.fn((value: Partial<ApprovalRequest>) => value),
    save: jest.fn((value: Partial<ApprovalRequest>) => ({
      id: value.id ?? 21,
      ...value,
    })),
  };
  const standardQaRepository = {
    findOne: jest.fn(),
    save: jest.fn((value: KnowledgeStandardQa) => value),
  };
  const service = new ApprovalRequestsService(
    approvalRepository as unknown as Repository<ApprovalRequest>,
    standardQaRepository as unknown as Repository<KnowledgeStandardQa>,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('submits a draft standard QA with a frozen content snapshot', async () => {
    const qa = createStandardQa();
    standardQaRepository.findOne.mockResolvedValue(qa);
    approvalRepository.findOne.mockResolvedValue(null);

    const result = await service.submitStandardQa(qa.id, applicant);

    expect(qa.status).toBe('pending');
    expect(standardQaRepository.save).toHaveBeenCalledWith(qa);
    expect(result).toMatchObject({
      businessType: 'standardQa',
      businessId: qa.id,
      applicantName: applicant.username,
      status: 'pending',
      contentSnapshot: {
        question: qa.question,
        answer: qa.answer,
        sourceChunkIds: [10, 11],
      },
    });
  });

  it('rejects a non-admin reviewer', async () => {
    await expect(service.approve(21, {}, applicant)).rejects.toThrow(
      '只有管理员可以处理审批',
    );
  });

  it('publishes the QA only after an administrator approves it', async () => {
    const qa = createStandardQa('pending');
    const request = {
      id: 21,
      businessType: 'standardQa',
      businessId: qa.id,
      status: 'pending',
    } as ApprovalRequest;
    approvalRepository.findOne.mockResolvedValue(request);
    standardQaRepository.findOne.mockResolvedValue(qa);

    const result = await service.approve(
      21,
      { remark: '内容准确' },
      administrator,
    );

    expect(qa.status).toBe('published');
    expect(qa.version).toBe(2);
    expect(result).toMatchObject({
      status: 'approved',
      reviewerId: administrator.userId,
      reviewerName: administrator.username,
      remark: '内容准确',
    });
  });
});
