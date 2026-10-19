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
  it('按指定 ID 选择启用创作配置，不回退聊天或其它配置', async () => {
    const repository = { findOne: jest.fn().mockResolvedValue(null) };
    const contentService = new AiFeatureConfigsService(
      repository as never,
      {} as never,
      {} as never,
    );
    await expect(
      contentService.findUsableContentCreationConfig(9),
    ).rejects.toThrow('不存在');
    for (const config of [
      { featureType: 'chat', isEnabled: true, providerId: 2, model: 'text' },
      {
        featureType: 'contentCreation',
        isEnabled: false,
        providerId: 2,
        model: 'text',
      },
      {
        featureType: 'contentCreation',
        isEnabled: true,
        providerId: null,
        model: 'text',
      },
      {
        featureType: 'contentCreation',
        isEnabled: true,
        providerId: 2,
        model: ' ',
      },
    ]) {
      repository.findOne.mockResolvedValue(config);
      await expect(
        contentService.findUsableContentCreationConfig(9),
      ).rejects.toThrow();
    }
    const config = {
      id: 9,
      featureType: 'contentCreation',
      isEnabled: true,
      providerId: 2,
      model: 'text',
    };
    repository.findOne.mockResolvedValue(config);
    await expect(
      contentService.findUsableContentCreationConfig(9),
    ).resolves.toEqual(config);
    expect(repository.findOne).toHaveBeenLastCalledWith({ where: { id: 9 } });
  });

  it('允许多个启用创作配置，仍校验账号模型能力', async () => {
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
    await expect(
      contentService.create({
        name: '第二个创作',
        featureType: 'contentCreation',
        providerId: 2,
        model: 'text',
      }),
    ).resolves.toMatchObject({ name: '第二个创作', isEnabled: true });
    expect(providers.assertModelSupported).toHaveBeenCalledWith({
      id: 2,
      model: 'text',
      featureType: 'contentCreation',
    });
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(repository.find).not.toHaveBeenCalled();
  });

  it('选项只查询启用创作的 ID、名称、模型，支持搜索分页且不外泄其它字段', async () => {
    const repository = {
      findAndCount: jest.fn().mockResolvedValue([
        [
          {
            id: 9,
            name: '创作',
            model: 'text',
            systemPrompt: 'private',
            thinkingParameters: { secret: true },
          },
        ],
        101,
      ]),
    };
    const service = new AiFeatureConfigsService(
      repository as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.contentCreationOptions({
        page: 2,
        pageSize: 100,
        keyword: ' 创作 ',
      }),
    ).resolves.toEqual({
      list: [{ id: 9, name: '创作', model: 'text' }],
      total: 101,
    });
    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, name: true, model: true },
        skip: 100,
        take: 100,
        where: expect.arrayContaining([
          expect.objectContaining({
            featureType: 'contentCreation',
            isEnabled: true,
          }),
        ]) as unknown,
      }),
    );
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
