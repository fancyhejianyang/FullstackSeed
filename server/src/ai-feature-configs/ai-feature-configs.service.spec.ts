import { Repository } from 'typeorm';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import { MineruConfigsService } from '../mineru-configs/mineru-configs.service';
import { AiFeatureConfig } from './entities/ai-feature-config.entity';
import { AiFeatureConfigsService } from './ai-feature-configs.service';

interface AiFeatureConfigInternals {
  normalizeFeatureSpecificSettings: (config: Partial<AiFeatureConfig>) => void;
}

describe('AiFeatureConfigsService', () => {
  it('keeps MinerU refinement settings and validates a text model', async () => {
    const repository = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    const providers = { findOne: jest.fn().mockResolvedValue({ id: 2, name: '整理账号' }), assertModelSupported: jest.fn() };
    const mineru = { findOne: jest.fn().mockResolvedValue({ id: 3, name: 'MinerU' }) };
    const configService = new AiFeatureConfigsService(repository as unknown as Repository<AiFeatureConfig>, providers as unknown as KnowledgeAiProvidersService, mineru as unknown as MineruConfigsService);
    const config = await configService.create({ name: 'OCR', featureType: 'ocr', useMineru: true, mineruConfigId: 3, providerId: 2, model: 'text-model', systemPrompt: '保留表格', temperature: 0 });
    expect(config).toMatchObject({ providerId: 2, model: 'text-model', systemPrompt: '保留表格', responseFormat: 'markdown', mineruConfigId: 3 });
    expect(providers.assertModelSupported).toHaveBeenCalledWith({ id: 2, model: 'text-model', featureType: 'documentParse' });
    await expect(configService.create({ name: 'OCR', featureType: 'ocr', useMineru: true, mineruConfigId: 3 })).rejects.toThrow('大模型账号');
  });
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

  it('keeps other enabled configurations when resolving the default by feature type', async () => {
    const newestConfig = { id: 9, name: '业务客服' } as AiFeatureConfig;
    const repository = {
      find: jest.fn().mockResolvedValue([newestConfig]),
      update: jest.fn(),
    } as unknown as Repository<AiFeatureConfig>;
    const multipleEnabledService = new AiFeatureConfigsService(
      repository,
      {} as KnowledgeAiProvidersService,
      {} as MineruConfigsService,
    );

    await expect(
      multipleEnabledService.findEnabledByFeature('chat'),
    ).resolves.toBe(newestConfig);
    expect(repository.find).toHaveBeenCalledWith({
      where: { featureType: 'chat', isEnabled: true },
      order: { id: 'DESC' },
      take: 1,
    });
    expect(repository.update).not.toHaveBeenCalled();
  });
});
