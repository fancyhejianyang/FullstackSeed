import { Repository } from 'typeorm';
import { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import { KnowledgeRetrievalConfigsService } from '../knowledge-retrieval-configs/knowledge-retrieval-configs.service';
import { KnowledgeAiChatMessage } from './entities/knowledge-ai-chat-message.entity';
import { KnowledgeAiChatSession } from './entities/knowledge-ai-chat-session.entity';
import { KnowledgeAiChatCommandService } from './knowledge-ai-chat-command.service';
import { KnowledgeAiChatService } from './knowledge-ai-chat.service';
import type { KnowledgeAiBusinessDataTrace } from './knowledge-ai-chat-trace';

interface KnowledgeAiChatServiceInternals {
  buildStandardQaState: (params: {
    question: string;
    retrievalConfigId?: number | null;
    enableOriginalStandardQa?: boolean;
    enableColloquial?: boolean;
    enableCalibratedStandardQa?: boolean;
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
  buildSystemMessageContent: (
    overridePrompt?: string,
    config?: { systemPrompt?: string | null; responseFormat?: string | null } | null,
    workflowInstruction?: string | null,
  ) => string;
}

describe('KnowledgeAiChatService', () => {
  const service = new KnowledgeAiChatService(
    {} as Repository<KnowledgeAiChatSession>,
    {} as Repository<KnowledgeAiChatMessage>,
    {} as KnowledgeRetrievalConfigsService,
    {} as AiFeatureConfigsService,
    {} as KnowledgeAiProvidersService,
    {} as KnowledgeAiChatCommandService,
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

  it('adds the selected workflow instruction to the answer-model system message', () => {
    const message = internals.buildSystemMessageContent(
      undefined,
      null,
      '仅依据业务数据和知识库资料回答；资料不足时明确说明。',
    );

    expect(message).toContain('【AI 工作流执行说明】');
    expect(message).toContain('仅依据业务数据和知识库资料回答');
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
      {} as KnowledgeRetrievalConfigsService,
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
        originalQa: expect.objectContaining({
          executed: true,
          matched: false,
          question: '小蓝多重？',
        }),
        colloquial: expect.objectContaining({
          evaluated: true,
          rewrittenQuestion: '蓝虎机器人 Pro 的重量是多少？',
        }),
        calibratedQa: expect.objectContaining({
          executed: true,
          matched: true,
          selectedEntryId: 7,
        }),
      }),
    );
  });

  it('keeps colloquial calibration but skips both QA matches when the workflow disables standard QA', async () => {
    const calls: string[] = [];
    const commandService = {
      rewriteColloquialQuestion: jest.fn().mockImplementation(async () => {
        calls.push('rewrite');
        return {
          rewrittenQuestion: '蓝虎机器人 Pro 的重量是多少？',
          semanticContext: '{"attribute":"weight"}',
          matches: [{ id: 3, term: '多重', replacement: '重量' }],
        };
      }),
      searchStandardQa: jest.fn().mockImplementation(async () => {
        calls.push('standard-qa');
        return null;
      }),
    } as unknown as KnowledgeAiChatCommandService;
    const pipelineService = new KnowledgeAiChatService(
      {} as Repository<KnowledgeAiChatSession>,
      {} as Repository<KnowledgeAiChatMessage>,
      {} as KnowledgeRetrievalConfigsService,
      {} as AiFeatureConfigsService,
      {} as KnowledgeAiProvidersService,
      commandService,
    ) as unknown as KnowledgeAiChatServiceInternals;

    const result = await pipelineService.buildStandardQaState({
      question: '小蓝多重？',
      retrievalConfigId: 2,
      enableOriginalStandardQa: false,
      enableColloquial: true,
      enableCalibratedStandardQa: false,
    });

    expect(calls).toEqual(['rewrite']);
    expect(result).toEqual(
      expect.objectContaining({
        answer: null,
        rewrittenQuestion: '蓝虎机器人 Pro 的重量是多少？',
        commandIds: ['colloquial.rewrite'],
        originalQa: expect.objectContaining({ executed: false }),
        colloquial: expect.objectContaining({ evaluated: true }),
        calibratedQa: expect.objectContaining({ executed: false }),
      }),
    );
  });
});

describe('product keyword lookup and business trace', () => {
  function setup() {
    const providers = { callChat: jest.fn().mockResolvedValue({ isSuccess: true, answer: '{"keywords":["靠枕"]}', usage: null }) };
    const commands = { lookupProductSku: jest.fn().mockResolvedValue(null) };
    const service = new KnowledgeAiChatService({} as never, {} as never, {} as never, {} as never, providers as never, commands as never);
    const question = '我还想要个睡觉用的靠枕，有哪些款式给我选择？';
    const standardQa = { answer: null, rewrittenQuestion: question };
    const target = { providerId: 1, model: 'test-model' };
    const workflow = { enableBusinessCommands: true };
    const config = { id: 2 };
    const lookup = (options?: { allowedCommandKeys: string[] }) => service['lookupBusinessData'](
      question, standardQa as never, target as never, config as never, workflow as never, options,
    );
    return { service, providers, commands, question, standardQa, workflow, lookup };
  }

  it('extracts original-question keywords before lookup and records a completed miss', async () => {
    const { service, providers, commands, question, lookup } = setup();
    const { trace } = await lookup();
    expect(providers.callChat.mock.invocationCallOrder[0]).toBeLessThan(commands.lookupProductSku.mock.invocationCallOrder[0]);
    expect(providers.callChat.mock.calls[0][0].messages[1].content).toContain(question);
    expect(commands.lookupProductSku).toHaveBeenCalledWith(question, undefined, ['靠枕']);
    expect(trace).toMatchObject({ status: 'not_matched', authorized: true, executed: true, matched: false, queryKeywords: ['靠枕'], keywordSource: 'ai' });
    const retrieval = service['emptyRetrievalState'](2, { id: 2 } as never, question, '', trace, false);
    expect(retrieval.businessData.executed).toBe(true);
    const prompt = service['buildQuestionContent'](question, retrieval);
    expect(prompt).toContain('已实际执行商品查询但未找到匹配结果');
    expect(prompt).toContain('禁止将知识库关闭解释为商品查询未授权或未启用');
    const withKnowledge = { ...retrieval, knowledgeRetrievalEnabled: true };
    expect(service['buildQuestionContent'](question, withKnowledge)).toContain('已实际执行商品查询但未找到匹配结果');
  });

  it('does not extract keywords or query products without app authorization', async () => {
    const { providers, commands, lookup } = setup();
    expect((await lookup({ allowedCommandKeys: [] })).trace).toMatchObject({ status: 'unauthorized', authorized: false, executed: false });
    expect(providers.callChat).not.toHaveBeenCalled();
    expect(commands.lookupProductSku).not.toHaveBeenCalled();
  });

  it('uses the current question when the conversation changes product category', async () => {
    const { service, providers, commands, lookup } = setup();
    providers.callChat.mockResolvedValueOnce({ isSuccess: true, answer: '{"keywords":["卷尺"]}', usage: null });
    await service['lookupBusinessData']('想买卷尺', { answer: null, rewrittenQuestion: '想买卷尺' } as never,
      { providerId: 1, model: 'test-model' } as never, { id: 2 } as never, { enableBusinessCommands: true } as never);
    await lookup();
    expect(commands.lookupProductSku.mock.calls[0][2]).toEqual(['卷尺']);
    expect(commands.lookupProductSku.mock.calls[1][2]).toEqual(['靠枕']);
    expect(providers.callChat.mock.calls[1][0].messages[1].content).not.toContain('卷尺');
  });

  it('distinguishes workflow-disabled from unauthorized', async () => {
    const { workflow, lookup, providers, commands } = setup();
    workflow.enableBusinessCommands = false;
    expect((await lookup()).trace).toMatchObject({ status: 'not_executed', authorized: true, executed: false });
    expect(providers.callChat).not.toHaveBeenCalled();
    expect(commands.lookupProductSku).not.toHaveBeenCalled();
  });

  it('does not run a business lookup when standard QA already answered', async () => {
    const { standardQa, lookup, commands, providers } = setup();
    Object.assign(standardQa, { answer: '固定答案' });
    expect((await lookup()).trace).toMatchObject({ status: 'not_executed', executed: false });
    expect(commands.lookupProductSku).not.toHaveBeenCalled();
    expect(providers.callChat).not.toHaveBeenCalled();
  });

  it.each(['not json', '{"keywords":["不存在于问题中的卷尺"]}'])('falls back on invalid extraction: %s', async (answer) => {
    const { providers, lookup } = setup();
    providers.callChat.mockResolvedValue({ isSuccess: true, answer, usage: null });
    const { trace } = await lookup();
    expect(trace.keywordSource).toBe('fallback');
    expect(trace.queryKeywords).toContain('靠枕');
    expect(trace.queryKeywords).not.toContain('卷尺');
  });

  it('keeps the read-only query working when keyword extraction fails', async () => {
    const { providers, lookup } = setup();
    providers.callChat.mockRejectedValue(new Error('模型超时'));
    expect((await lookup()).trace).toMatchObject({ status: 'not_matched', executed: true, keywordSource: 'fallback' });
  });

  it('records matches separately from execution and preserves extraction token usage', async () => {
    const { commands, providers, lookup } = setup();
    const context = { matchType: 'product', product: { id: 40 }, sku: null, candidateSkus: [] };
    commands.lookupProductSku.mockResolvedValue(context);
    const usage = { promptTokens: 20, completionTokens: 5, totalTokens: 25 };
    providers.callChat.mockResolvedValue({ isSuccess: true, answer: '{"keywords":["靠枕"]}', usage });
    const result = await lookup();
    expect(result.trace).toMatchObject({ status: 'matched', executed: true, matched: true, context });
    expect(result.usage).toEqual(usage);
  });

  it('persists a failed query instead of presenting it as a miss or missing permission', async () => {
    const { service, commands, lookup } = setup();
    const recorded: KnowledgeAiBusinessDataTrace[] = [];
    const traceWriter = service as unknown as { persistBusinessTrace: (trace: KnowledgeAiBusinessDataTrace) => Promise<void> };
    jest.spyOn(traceWriter, 'persistBusinessTrace').mockImplementation(async (trace) => {
      recorded.push({ ...trace });
    });
    commands.lookupProductSku.mockRejectedValue(new Error('数据库不可用'));
    await expect(lookup()).rejects.toThrow('数据库不可用');
    expect(recorded.at(-1)).toMatchObject({ status: 'failed', authorized: true, executed: true, matched: false });
  });
});
