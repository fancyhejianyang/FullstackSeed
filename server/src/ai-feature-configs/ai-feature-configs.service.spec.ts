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
    const repository = {
      create: jest.fn((value: unknown) => value),
      save: jest.fn((value: unknown) => Promise.resolve(value)),
    };
    const providers = {
      findOne: jest.fn().mockResolvedValue({ id: 2, name: '整理账号' }),
      assertModelSupported: jest.fn(),
    };
    const mineru = {
      findOne: jest.fn().mockResolvedValue({ id: 3, name: 'MinerU' }),
    };
    const configService = new AiFeatureConfigsService(
      repository as unknown as Repository<AiFeatureConfig>,
      providers as unknown as KnowledgeAiProvidersService,
      mineru as unknown as MineruConfigsService,
    );
    const config = await configService.create({
      name: 'OCR',
      featureType: 'ocr',
      useMineru: true,
      mineruConfigId: 3,
      providerId: 2,
      model: 'text-model',
      systemPrompt: '保留表格',
      temperature: 0,
    });
    expect(config).toMatchObject({
      providerId: 2,
      model: 'text-model',
      systemPrompt: '保留表格',
      responseFormat: 'markdown',
      mineruConfigId: 3,
    });
    expect(providers.assertModelSupported).toHaveBeenCalledWith({
      id: 2,
      model: 'text-model',
      featureType: 'documentParse',
    });
    await expect(
      configService.create({
        name: 'OCR',
        featureType: 'ocr',
        useMineru: true,
        mineruConfigId: 3,
      }),
    ).rejects.toThrow('大模型账号');
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

  it('内容创作固定 Markdown，保留文本模型与 Think 设置', () => {
    const config: Partial<AiFeatureConfig> = {
      featureType: 'contentCreation',
      useMineru: true,
      mineruConfigId: 3,
      responseFormat: 'json',
      enableThinking: true,
      thinkingParameters: { enable_thinking: true },
    };
    internals.normalizeFeatureSpecificSettings(config);
    expect(config).toMatchObject({
      useMineru: false,
      mineruConfigId: null,
      responseFormat: 'markdown',
      enableThinking: true,
      thinkingParameters: { enable_thinking: true },
    });
  });
  it('创作配置必须唯一，不回退聊天配置', async () => {
    const repository = { find: jest.fn().mockResolvedValue([]) };
    const contentService = new AiFeatureConfigsService(
      repository as never,
      {} as never,
      {} as never,
    );
    await expect(contentService.findContentCreationConfig()).rejects.toThrow(
      '内容创作',
    );
    const config = { id: 1, providerId: 2, model: 'text' };
    repository.find.mockResolvedValue([config, { ...config, id: 2 }]);
    await expect(contentService.findContentCreationConfig()).rejects.toThrow(
      '仅启用一个',
    );
    repository.find.mockResolvedValue([config]);
    await expect(contentService.findContentCreationConfig()).resolves.toEqual(
      config,
    );
    expect(repository.find).toHaveBeenLastCalledWith({
      where: { featureType: 'contentCreation', isEnabled: true },
      take: 2,
    });
  });
  it('拒绝第二个启用创作配置，数据库并发冲突也转换为明确错误', async () => {
    const repository = {
      create: jest.fn((value: unknown) => value),
      save: jest.fn((value: unknown) => Promise.resolve(value)),
      find: jest.fn().mockResolvedValue([{ id: 1 }]),
    };
    const providers = {
      findOne: jest.fn().mockResolvedValue({ id: 2, name: '账号' }),
      assertModelSupported: jest.fn(),
    };
    const contentService = new AiFeatureConfigsService(
      repository as never,
      providers as never,
      {} as never,
    );
    const dto = {
      name: '创作',
      featureType: 'contentCreation' as const,
      providerId: 2,
      model: 'text',
    };
    await expect(contentService.create(dto)).rejects.toThrow('先停用');
    expect(repository.save).not.toHaveBeenCalled();
    repository.find.mockResolvedValue([]);
    repository.save.mockRejectedValue({ code: 'ER_DUP_ENTRY' });
    await expect(contentService.create(dto)).rejects.toThrow('先停用');
  });

  it('keeps other enabled configurations when resolving the default by feature type', async () => {
    const newestConfig = { id: 9, name: '业务客服' } as AiFeatureConfig;
    const repository = {
      find: jest.fn().mockResolvedValue([newestConfig]),
      update: jest.fn(),
    };
    const multipleEnabledService = new AiFeatureConfigsService(
      repository as unknown as Repository<AiFeatureConfig>,
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
