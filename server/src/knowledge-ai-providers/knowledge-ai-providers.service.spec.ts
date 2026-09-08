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
});
