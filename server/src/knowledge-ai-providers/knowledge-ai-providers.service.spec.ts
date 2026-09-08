import { Repository } from 'typeorm';
import { LogRecordsService } from '../log-records/log-records.service';
import { KnowledgeAiProvider } from './entities/knowledge-ai-provider.entity';
import { KnowledgeAiProvidersService } from './knowledge-ai-providers.service';

interface ProviderInternals {
  extractTokenUsage: (data: { usage?: unknown; output?: unknown }) => {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  } | null;
  buildChatRequestBody: (payload: {
    model: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    temperature: number;
    stream?: boolean;
    thinkingParameters?: Record<string, unknown> | null;
  }) => Record<string, unknown>;
  consumeStreamBlock: (
    block: string,
    onDelta: (content: string) => void,
    onThinkingDelta?: (content: string) => void,
  ) => {
    content: string;
    thinkingContent: string;
    isDone: boolean;
  };
}

describe('KnowledgeAiProvidersService', () => {
  const service = new KnowledgeAiProvidersService(
    {} as Repository<KnowledgeAiProvider>,
    {} as LogRecordsService,
  );
  const internals = service as unknown as ProviderInternals;

  it('normalizes standard and alternate model usage field names', () => {
    expect(
      internals.extractTokenUsage({
        usage: {
          prompt_tokens: 120,
          completion_tokens: 36,
          total_tokens: 156,
        },
      }),
    ).toEqual({ promptTokens: 120, completionTokens: 36, totalTokens: 156 });

    expect(
      internals.extractTokenUsage({
        usage: { input_tokens: 80, output_tokens: 20 },
      }),
    ).toEqual({ promptTokens: 80, completionTokens: 20, totalTokens: 100 });
  });

  it('returns null when the upstream response has no usable token usage', () => {
    expect(internals.extractTokenUsage({ usage: {} })).toBeNull();
  });

  it('merges Think parameters without allowing them to replace core request fields', () => {
    const body = internals.buildChatRequestBody({
      model: 'qwen-test',
      messages: [{ role: 'user', content: '你好' }],
      temperature: 0.2,
      stream: true,
      thinkingParameters: {
        enable_thinking: true,
        model: 'should-not-apply',
        stream: false,
      },
    });

    expect(body).toMatchObject({
      enable_thinking: true,
      model: 'qwen-test',
      stream: true,
      stream_options: { include_usage: true },
    });
  });

  it('forwards streaming reasoning content through the dedicated callback', () => {
    const thinkingChunks: string[] = [];
    const answerChunks: string[] = [];

    const result = internals.consumeStreamBlock(
      'data: {"choices":[{"delta":{"reasoning_content":"先核对资料。","content":"最终答案"}}]}',
      (content) => answerChunks.push(content),
      (content) => thinkingChunks.push(content),
    );

    expect(thinkingChunks).toEqual(['先核对资料。']);
    expect(answerChunks).toEqual(['最终答案']);
    expect(result).toMatchObject({
      thinkingContent: '先核对资料。',
      content: '最终答案',
    });
  });
});
