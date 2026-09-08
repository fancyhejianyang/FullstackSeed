import { Repository } from 'typeorm';
import { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import { KnowledgeAiChatRetrievalService } from './knowledge-ai-chat-retrieval.service';
import { KnowledgeAiChatMessage } from './entities/knowledge-ai-chat-message.entity';
import { KnowledgeAiChatSession } from './entities/knowledge-ai-chat-session.entity';
import { KnowledgeAiChatService } from './knowledge-ai-chat.service';

interface KnowledgeAiChatServiceInternals {
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
});
