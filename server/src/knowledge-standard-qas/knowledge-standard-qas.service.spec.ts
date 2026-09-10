import type { Repository } from 'typeorm';
import { KnowledgeAiChatMessage } from '../knowledge-ai-chat/entities/knowledge-ai-chat-message.entity';
import { KnowledgeRetrievalConfig } from '../knowledge-retrieval-configs/entities/knowledge-retrieval-config.entity';
import { KnowledgeStandardQa } from './entities/knowledge-standard-qa.entity';
import { KnowledgeStandardQasService } from './knowledge-standard-qas.service';

function createQa(
  id: number,
  retrievalConfigId: number | null,
  aliases: string[] = [],
) {
  return {
    id,
    question: '公司的年假制度是什么？',
    aliases,
    answer: `标准答案 #${id}`,
    retrievalConfigId,
    status: 'published',
    effectiveAt: null,
    expiresAt: null,
    hitCount: 2,
  } as KnowledgeStandardQa;
}

describe('KnowledgeStandardQasService', () => {
  const queryBuilder = {
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    getMany: jest.fn(),
  };
  queryBuilder.where.mockReturnValue(queryBuilder);
  queryBuilder.andWhere.mockReturnValue(queryBuilder);
  queryBuilder.orderBy.mockReturnValue(queryBuilder);

  const qaRepository = {
    createQueryBuilder: jest.fn(() => queryBuilder),
    update: jest.fn(),
  };
  const service = new KnowledgeStandardQasService(
    qaRepository as unknown as Repository<KnowledgeStandardQa>,
    {} as Repository<KnowledgeRetrievalConfig>,
    {} as Repository<KnowledgeAiChatMessage>,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    queryBuilder.where.mockReturnValue(queryBuilder);
    queryBuilder.andWhere.mockReturnValue(queryBuilder);
    queryBuilder.orderBy.mockReturnValue(queryBuilder);
  });

  it('uses an exact alias match and gives the active retrieval configuration precedence', async () => {
    const globalQa = createQa(10, null, ['年假有几天']);
    const scopedQa = createQa(3, 7, ['年假有几天']);
    queryBuilder.getMany.mockResolvedValue([globalQa, scopedQa]);

    const result = await service.matchForChat({
      retrievalConfigId: 7,
      question: '年假，有几天？',
    });

    expect(result?.entry).toBe(scopedQa);
    expect(qaRepository.update).toHaveBeenCalledWith(
      scopedQa.id,
      expect.objectContaining({ hitCount: 3, lastHitAt: expect.any(Date) }),
    );
  });

  it('does not return a fixed answer for a merely related question', async () => {
    queryBuilder.getMany.mockResolvedValue([
      createQa(1, null, ['年假有几天']),
    ]);

    await expect(
      service.matchForChat({
        retrievalConfigId: null,
        question: '年假可以提现吗？',
      }),
    ).resolves.toBeNull();
    expect(qaRepository.update).not.toHaveBeenCalled();
  });
});
