import { Repository } from 'typeorm';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import { MineruConfigsService } from '../mineru-configs/mineru-configs.service';
import { AiFeatureConfig } from './entities/ai-feature-config.entity';
import { AiFeatureConfigsService } from './ai-feature-configs.service';
import { AiFeatureConfigsController } from './ai-feature-configs.controller';
import { PERMISSIONS_KEY } from '../common/decorators/require-permissions.decorator';

interface AiFeatureConfigInternals {
  normalizeFeatureSpecificSettings: (config: Partial<AiFeatureConfig>) => void;
}

describe('AiFeatureConfigsService', () => {
  it('模型接口检查使用功能编辑权限，不要求账号管理权限', () => {
    const permissions = Reflect.getMetadata(
      PERMISSIONS_KEY,
      Object.getOwnPropertyDescriptor(
        AiFeatureConfigsController.prototype,
        'checkModelEndpoint',
      )?.value as object,
    ) as string[];
    expect(permissions).toEqual(['Menu.read']);
  });

  it('MinerU OCR 整理检查普通调用，不将账号凭据返回编辑器', async () => {
    const providers = {
      inspectFeatureEndpoint: jest.fn().mockResolvedValue({
        functionType: 'chat',
        functionLabel: '普通调用',
        source: 'configured',
        ruleName: '模型专用 · text-model（普通调用）',
        url: 'https://example.com/vendor/text',
        secretKey: 'must-stay-internal',
      }),
    };
    const configService = new AiFeatureConfigsService(
      {} as Repository<AiFeatureConfig>,
      providers as unknown as KnowledgeAiProvidersService,
      {} as MineruConfigsService,
    );
    await expect(
      configService.checkModelEndpoint({
        providerId: 2,
        model: 'text-model',
        featureType: 'ocr',
        useMineru: true,
      }),
    ).resolves.toEqual({
      functionType: 'chat',
      functionLabel: '普通调用',
      source: 'configured',
      ruleName: '模型专用 · text-model（普通调用）',
      apiPath: '/vendor/text',
      searchApiPath: null,
    });
    expect(providers.inspectFeatureEndpoint).toHaveBeenCalledWith({
      id: 2,
      model: 'text-model',
      featureType: 'documentParse',
    });
  });

  it('热点检查校验实际 Responses 路径，拒绝不受支持的地址和旧协议', async () => {
    const providers = {
      inspectFeatureEndpoint: jest.fn().mockResolvedValue({
        functionType: 'chat',
        functionLabel: '普通调用',
        source: 'standard',
        url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      }),
    };
    const configService = new AiFeatureConfigsService(
      {} as Repository<AiFeatureConfig>,
      providers as unknown as KnowledgeAiProvidersService,
      {} as MineruConfigsService,
    );
    const payload = {
      providerId: 2,
      model: 'qwen-plus',
      featureType: 'topicDiscovery',
      webSearchMode: 'bailianResponses',
    } as const;
    await expect(
      configService.checkModelEndpoint(payload),
    ).resolves.toMatchObject({
      searchApiPath: '/compatible-mode/v1/responses',
    });
    await expect(
      configService.checkModelEndpoint({
        ...payload,
        webSearchMode: 'bailianChat',
      }),
    ).rejects.toThrow('百炼 Responses');
    providers.inspectFeatureEndpoint.mockResolvedValueOnce({
      functionType: 'chat',
      functionLabel: '普通调用',
      source: 'configured',
      url: 'https://tokenhub.tencentmaas.com/vendor/chat',
    });
    await expect(configService.checkModelEndpoint(payload)).rejects.toThrow(
      '当前仅支持百炼',
    );
  });

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

  it('热点配置固定结构化输出，显式保留联网协议且不影响普通写作', () => {
    const config: Partial<AiFeatureConfig> = {
      featureType: 'topicDiscovery',
      webSearchMode: 'bailianResponses',
      responseFormat: 'markdown',
      useMineru: true,
      mineruConfigId: 8,
    };
    internals.normalizeFeatureSpecificSettings(config);
    expect(config).toMatchObject({
      webSearchMode: 'bailianResponses',
      responseFormat: 'json',
      useMineru: false,
      mineruConfigId: null,
    });
    config.featureType = 'contentCreation';
    config.responseFormat = 'text';
    internals.normalizeFeatureSpecificSettings(config);
    expect(config.webSearchMode).toBe('disabled');
  });

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

  it('图片生成默认启用图生图能力，其它配置强制关闭', () => {
    const imageConfig: Partial<AiFeatureConfig> = {
      featureType: 'imageGeneration',
    };
    internals.normalizeFeatureSpecificSettings(imageConfig);
    expect(imageConfig.supportsImageToImage).toBe(true);

    const chatConfig: Partial<AiFeatureConfig> = {
      featureType: 'chat',
      supportsImageToImage: true,
    };
    internals.normalizeFeatureSpecificSettings(chatConfig);
    expect(chatConfig.supportsImageToImage).toBe(false);
  });

  it('视频生成默认启用图生视频能力，并与图片能力互斥', () => {
    const config: Partial<AiFeatureConfig> = {
      featureType: 'videoGeneration',
      supportsImageToImage: true,
    };
    internals.normalizeFeatureSpecificSettings(config);
    expect(config.supportsImageToVideo).toBe(true);
    expect(config.supportsImageToImage).toBe(false);
    expect(config.enableThinking).toBe(false);
    expect(config.responseFormat).toBe('text');
  });

  it('素材配置选项包含图生图能力但不暴露账号和提示词', async () => {
    const repository = {
      findAndCount: jest.fn().mockResolvedValue([
        [
          {
            id: 7,
            name: '生图',
            model: 'qwen-image',
            supportsImageToImage: true,
          },
        ],
        1,
      ]),
    };
    const imageService = new AiFeatureConfigsService(
      repository as never,
      {} as never,
      {} as never,
    );
    await expect(imageService.imageGenerationOptions({})).resolves.toEqual({
      list: [
        {
          id: 7,
          name: '生图',
          model: 'qwen-image',
          supportsImageToImage: true,
        },
      ],
      total: 1,
    });
    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          name: true,
          model: true,
          supportsImageToImage: true,
        },
      }),
    );
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

  it.each(['text', 'markdown'] as const)(
    '内容创作保留所选 %s 格式与 Think 设置',
    (responseFormat) => {
      const config: Partial<AiFeatureConfig> = {
        featureType: 'contentCreation',
        useMineru: true,
        mineruConfigId: 3,
        responseFormat,
        enableThinking: true,
        thinkingParameters: { enable_thinking: true },
      };
      internals.normalizeFeatureSpecificSettings(config);
      expect(config).toMatchObject({
        useMineru: false,
        mineruConfigId: null,
        responseFormat,
        enableThinking: true,
        thinkingParameters: { enable_thinking: true },
      });
    },
  );
  it('新创作配置默认纯文本；拒绝 JSON 正文；不改变解析与重排规范', () => {
    const config: Partial<AiFeatureConfig> = { featureType: 'contentCreation' };
    internals.normalizeFeatureSpecificSettings(config);
    expect(config.responseFormat).toBe('text');
    expect(() =>
      internals.normalizeFeatureSpecificSettings({
        ...config,
        responseFormat: 'json',
      }),
    ).toThrow('仅支持');
    const ocr: Partial<AiFeatureConfig> = {
      featureType: 'ocr',
      useMineru: true,
      responseFormat: 'text',
    };
    internals.normalizeFeatureSpecificSettings(ocr);
    expect(ocr.responseFormat).toBe('markdown');
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
      responseFormat: 'text',
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
    ).resolves.toMatchObject({
      name: '第二个创作',
      isEnabled: true,
      responseFormat: 'text',
    });
    expect(providers.assertModelSupported).toHaveBeenCalledWith({
      id: 2,
      model: 'text',
      featureType: 'contentCreation',
    });
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(repository.find).not.toHaveBeenCalled();
  });

  it('选项只查询启用创作的 ID、名称、模型和格式，支持搜索分页且不外泄其它字段', async () => {
    const repository = {
      findAndCount: jest.fn().mockResolvedValue([
        [
          {
            id: 9,
            name: '创作',
            model: 'text',
            responseFormat: 'text',
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
      list: [{ id: 9, name: '创作', model: 'text', responseFormat: 'text' }],
      total: 101,
    });
    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, name: true, model: true, responseFormat: true },
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
