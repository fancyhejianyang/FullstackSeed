import { Repository } from 'typeorm';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import { MineruConfigsService } from '../mineru-configs/mineru-configs.service';
import { AiFeatureConfig } from './entities/ai-feature-config.entity';
import { AiFeatureConfigsService } from './ai-feature-configs.service';

interface AiFeatureConfigInternals {
  normalizeFeatureSpecificSettings: (config: Partial<AiFeatureConfig>) => void;
}

describe('AiFeatureConfigsService', () => {
  const service = new AiFeatureConfigsService(
    {} as Repository<AiFeatureConfig>,
    {} as KnowledgeAiProvidersService,
    {} as MineruConfigsService,
  );
  const internals = service as unknown as AiFeatureConfigInternals;

  it('keeps non-core Think parameters for enabled chat configurations', () => {
    const config: Partial<AiFeatureConfig> = {
      featureType: 'chat',
      enableThinking: true,
      thinkingParameters: { enable_thinking: true },
    };

    internals.normalizeFeatureSpecificSettings(config);

    expect(config.thinkingParameters).toEqual({ enable_thinking: true });
  });

  it('rejects Think parameters that could override the chat request', () => {
    expect(() =>
      internals.normalizeFeatureSpecificSettings({
        featureType: 'chat',
        enableThinking: true,
        thinkingParameters: { stream: false },
      }),
    ).toThrow('Think 参数不允许覆盖请求字段：stream');
  });

  it('clears Think settings on non-chat configurations', () => {
    const config: Partial<AiFeatureConfig> = {
      featureType: 'ocr',
      enableThinking: true,
      thinkingParameters: { enable_thinking: true },
    };

    internals.normalizeFeatureSpecificSettings(config);

    expect(config.enableThinking).toBe(false);
    expect(config.thinkingParameters).toBeNull();
  });

  it('locks LLM rerank configurations to the internal deterministic JSON scorer', () => {
    const config: Partial<AiFeatureConfig> = {
      featureType: 'rerank',
      enableThinking: true,
      thinkingParameters: { enable_thinking: true },
      useMineru: true,
      mineruConfigId: 8,
      mineruConfigName: '默认 MinerU',
      systemPrompt: '请随意回答',
      temperature: 1,
      responseFormat: 'markdown',
    };

    internals.normalizeFeatureSpecificSettings(config);

    expect(config).toMatchObject({
      enableThinking: false,
      thinkingParameters: null,
      useMineru: false,
      mineruConfigId: null,
      mineruConfigName: null,
      systemPrompt: null,
      temperature: 0,
      responseFormat: 'json',
    });
  });
});
