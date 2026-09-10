import type { Repository } from 'typeorm';
import { KnowledgeRetrievalConfig } from '../knowledge-retrieval-configs/entities/knowledge-retrieval-config.entity';
import { KnowledgeColloquialTerm } from './entities/knowledge-colloquial-term.entity';
import { KnowledgeColloquialTermsService } from './knowledge-colloquial-terms.service';

function createTerm(
  id: number,
  term: string,
  replacement: string,
  options: Partial<KnowledgeColloquialTerm> = {},
) {
  return {
    id,
    term,
    replacement,
    semanticType: 'custom',
    semanticDefinition: `${term} 的人工维护语义`,
    retrievalConfigId: null,
    excludePhrases: null,
    isEnabled: true,
    ...options,
  } as KnowledgeColloquialTerm;
}

describe('KnowledgeColloquialTermsService', () => {
  const termRepository = {
    find: jest.fn(),
  };
  const service = new KnowledgeColloquialTermsService(
    termRepository as unknown as Repository<KnowledgeColloquialTerm>,
    {} as Repository<KnowledgeRetrievalConfig>,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('combines a product alias and an attribute expression into a standard question', async () => {
    termRepository.find.mockResolvedValue([
      createTerm(1, '小蓝', '蓝虎机器人 Pro', {
        semanticType: 'product-alias',
        semanticDefinition: '“小蓝”是蓝虎机器人 Pro 的产品简称',
      }),
      createTerm(2, '多重', ' 的重量是多少？', {
        semanticType: 'attribute',
        semanticDefinition: JSON.stringify({
          intent: '询问物品质量 / 重量',
          answerUnit: ['kg', 'g'],
        }),
      }),
    ]);

    await expect(
      service.rewriteQuestion({ question: '小蓝多重', retrievalConfigId: 7 }),
    ).resolves.toEqual(
      expect.objectContaining({
        rewrittenQuestion: '蓝虎机器人 Pro 的重量是多少？',
        matches: [
          expect.objectContaining({ id: 1, term: '小蓝' }),
          expect.objectContaining({ id: 2, term: '多重' }),
        ],
        semanticContext: expect.stringContaining('"answerUnit"'),
      }),
    );
  });

  it('gives a scoped expression precedence over the same global expression', async () => {
    termRepository.find.mockResolvedValue([
      createTerm(1, '小蓝', '蓝虎机器人标准版'),
      createTerm(2, '小蓝', '蓝虎机器人 Pro', { retrievalConfigId: 7 }),
    ]);

    await expect(
      service.rewriteQuestion({ question: '小蓝', retrievalConfigId: 7 }),
    ).resolves.toEqual(
      expect.objectContaining({
        rewrittenQuestion: '蓝虎机器人 Pro',
        matches: [expect.objectContaining({ id: 2 })],
      }),
    );
  });

  it('does not rewrite an expression when an exclusion phrase is present', async () => {
    termRepository.find.mockResolvedValue([
      createTerm(1, '多重', ' 的重量是多少？', {
        semanticType: 'attribute',
        excludePhrases: ['多重因素'],
      }),
    ]);

    await expect(
      service.rewriteQuestion({ question: '多重因素如何分析？' }),
    ).resolves.toEqual({
      rewrittenQuestion: '多重因素如何分析？',
      semanticContext: '',
      matches: [],
    });
  });

  it('serializes plain-language semantic definitions into the same JSON constraint payload', async () => {
    termRepository.find.mockResolvedValue([
      createTerm(1, '多重', '重量', {
        semanticType: 'attribute',
        semanticDefinition: '此处“多重”询问物品质量，而不是多重因素。',
      }),
    ]);

    const result = await service.rewriteQuestion({ question: '多重' });

    expect(result.semanticContext).toContain('"semantic": "此处“多重”询问物品质量，而不是多重因素。"');
  });
});
