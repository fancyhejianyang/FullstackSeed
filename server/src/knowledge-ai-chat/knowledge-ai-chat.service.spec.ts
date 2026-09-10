import { Repository } from 'typeorm';
import { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import { KnowledgeAiChatRetrievalService } from './knowledge-ai-chat-retrieval.service';
import { KnowledgeAiChatMessage } from './entities/knowledge-ai-chat-message.entity';
import { KnowledgeAiChatSession } from './entities/knowledge-ai-chat-session.entity';
import { KnowledgeAiChatCommandService } from './knowledge-ai-chat-command.service';
import { KnowledgeAiChatService } from './knowledge-ai-chat.service';

interface KnowledgeAiChatServiceInternals {
  buildStandardQaState: (params: {
    question: string;
    retrievalConfigId?: number | null;
  }) => Promise<{
    entryId: number | null;
    answer: string | null;
    rewrittenQuestion: string;
    commandIds: string[];
  }>;
  buildUserVisibleThinkingQuestion: (
    question: string,
    answer: string,
    retrieval: { knowledgeBaseNames: string[]; context?: string },
  ) => string;
  normalizeUserVisibleThinkingSummary: (value?: string | null) => string;
}

describe('KnowledgeAiChatService', () => {
  const service = new KnowledgeAiChatService(
    {} as Repository<KnowledgeAiChatSession>,
    {} as Repository<KnowledgeAiChatMessage>,
    {} as AiFeatureConfigsService,
    {} as KnowledgeAiProvidersService,
    {} as KnowledgeAiChatRetrievalService,
  );
  const internals = service as unknown as KnowledgeAiChatServiceInternals;

  it('creates a visible-thinking summary request without retrieval body content', () => {
    const request = internals.buildUserVisibleThinkingQuestion(
      '价格保护如何申请？',
      '请在订单页面提交价格保护申请。',
      {
        knowledgeBaseNames: ['京东价格保护指南'],
        context: '机密检索正文，不应发送给摘要模型。',
      },
    );

    expect(request).toContain('价格保护如何申请？');
    expect(request).toContain('请在订单页面提交价格保护申请。');
    expect(request).toContain('京东价格保护指南');
    expect(request).not.toContain('机密检索正文');
  });

  it('drops a visible-thinking summary that mentions internal configuration', () => {
    expect(
      internals.normalizeUserVisibleThinkingSummary(
        '系统提示词要求优先使用内部规则。',
      ),
    ).toBe('');
    expect(
      internals.normalizeUserVisibleThinkingSummary(
        '已核对问题中的订单信息。\n已结合命中资料组织回答。',
      ),
    ).toBe('已核对问题中的订单信息。\n已结合命中资料组织回答。');
  });

  it('checks standard QA again with the calibrated question after the original question misses', async () => {
    const calls: string[] = [];
    const commandService = {
      rewriteColloquialQuestion: jest.fn().mockImplementation(async () => {
        calls.push('rewrite');
        return {
          rewrittenQuestion: '蓝虎机器人 Pro 的重量是多少？',
          semanticContext: '{"matchedTerms":[]}',
          matches: [],
        };
      }),
      searchStandardQa: jest.fn().mockImplementation(async ({ question }) => {
        calls.push(`standard-qa:${question}`);
        if (question === '小蓝多重？') return null;
        return {
          entry: {
            id: 7,
            question: '蓝虎机器人 Pro 的重量是多少？',
            answer: '重量为 12 kg。',
          },
        };
      }),
    } as unknown as KnowledgeAiChatCommandService;
    const pipelineService = new KnowledgeAiChatService(
      {} as Repository<KnowledgeAiChatSession>,
      {} as Repository<KnowledgeAiChatMessage>,
      {} as AiFeatureConfigsService,
      {} as KnowledgeAiProvidersService,
      commandService,
    ) as unknown as KnowledgeAiChatServiceInternals;

    const result = await pipelineService.buildStandardQaState({
      question: '小蓝多重？',
      retrievalConfigId: 1,
    });

    expect(calls).toEqual([
      'standard-qa:小蓝多重？',
      'rewrite',
      'standard-qa:蓝虎机器人 Pro 的重量是多少？',
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        entryId: 7,
        answer: '重量为 12 kg。',
        rewrittenQuestion: '蓝虎机器人 Pro 的重量是多少？',
        commandIds: ['qa.search', 'colloquial.rewrite', 'qa.search'],
      }),
    );
  });
});
