import type { Repository } from 'typeorm';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import { KnowledgeAiProvider } from '../knowledge-ai-providers/entities/knowledge-ai-provider.entity';
import type { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import type { LogRecordsService } from '../log-records/log-records.service';
import { ModelEndpointsService } from './model-endpoints.service';
import { ModelEndpoint } from './entities/model-endpoint.entity';

describe('生图候选与实际调用共用配置校验', () => {
  function imageHarness() {
    const provider = Object.assign(new KnowledgeAiProvider(), {
      id: 1,
      name: '生图账号',
      isEnabled: true,
      apiUrl: 'https://tokenhub.tencentmaas.com/v1',
      secretKey: 'private-test-key',
      imageGenerationModels:
        'ready\noff\nmissing\nforeign\ninvalid\nreference-only\nready',
    });
    const route = (modelCode: string, values: Partial<ModelEndpoint> = {}) =>
      Object.assign(new ModelEndpoint(), {
        modelCode,
        modelName: modelCode,
        platformType: 'tencentTokenhub',
        functionType: 'textToImage',
        protocol: 'openaiImages',
        apiPath: '/v1/images/generations',
        taskApiPath: '',
        executionMode: 'sync',
        isActive: true,
        ...values,
      });
    const rows = [
      route('ready'),
      route('off', { isActive: false }),
      route('foreign', { platformType: 'aliyunBailian' }),
      route('invalid', { protocol: 'openaiChat' }),
      route('reference-only', {
        functionType: 'imageToImage',
        protocol: 'tokenhubSeedreamImage',
      }),
    ];
    const routeRepository = {
      find: jest.fn(({ where }: { where: Partial<ModelEndpoint> }) =>
        Promise.resolve(
          rows.filter((row) => row.functionType === where.functionType),
        ),
      ),
      findOne: jest.fn(({ where }: { where: Partial<ModelEndpoint> }) =>
        Promise.resolve(
          rows.find(
            (row) =>
              row.platformType === where.platformType &&
              row.modelCode === where.modelCode &&
              row.functionType === where.functionType,
          ) ?? null,
        ),
      ),
    };
    const providerRepository = {
      findOne: jest.fn().mockResolvedValue(provider),
      findAndCount: jest.fn().mockResolvedValue([[provider], 1]),
    };
    const endpoints = new ModelEndpointsService(
      routeRepository as unknown as Repository<ModelEndpoint>,
    );
    const service = new KnowledgeAiProvidersService(
      providerRepository as unknown as Repository<KnowledgeAiProvider>,
      {} as Repository<AiFeatureConfig>,
      {} as LogRecordsService,
      endpoints,
    );
    return { service, provider, rows, routeRepository };
  }

  it('保留所有登记模型并区分缺卡、停用、平台不符与无效协议，目录查询只批量读取一次', async () => {
    const { service, routeRepository } = imageHarness();
    const { list } = await service.findAll({ page: 1, pageSize: 20 });
    expect(routeRepository.find).toHaveBeenCalledTimes(1);
    expect(routeRepository.findOne).not.toHaveBeenCalled();
    expect(list[0].imageGenerationModelOptions).toEqual([
      { model: 'ready', available: true, unavailableReason: null },
      { model: 'off', available: false, unavailableReason: '文生图接口已停用' },
      {
        model: 'missing',
        available: false,
        unavailableReason: '未配置当前平台的文生图接口',
      },
      {
        model: 'foreign',
        available: false,
        unavailableReason: '文生图接口与当前账号平台不匹配',
      },
      {
        model: 'invalid',
        available: false,
        unavailableReason: '文生图接口配置无效，请检查协议、路径与账号地址',
      },
      {
        model: 'reference-only',
        available: false,
        unavailableReason: '未配置当前平台的文生图接口',
      },
    ]);
    expect(list[0].imageEndpointModels).toEqual(['ready']);
    expect(JSON.stringify(list[0].imageGenerationModelOptions)).not.toMatch(
      /https|private-test-key/,
    );
    await expect(
      service.resolveAgentMediaTarget(1, 'ready', 'imageGeneration'),
    ).resolves.toMatchObject({ model: 'ready' });
    for (const model of [
      'off',
      'missing',
      'foreign',
      'invalid',
      'reference-only',
    ])
      await expect(
        service.resolveAgentMediaTarget(1, model, 'imageGeneration'),
      ).rejects.toThrow();
  });

  it('候选返回后停用接口，保存使用的目标解析仍拒绝；重新读取更新不可用原因', async () => {
    const { service, rows } = imageHarness();
    expect(
      (await service.findOne(1)).imageGenerationModelOptions[0].available,
    ).toBe(true);
    rows[0].isActive = false;
    await expect(
      service.resolveAgentMediaTarget(1, 'ready', 'imageGeneration'),
    ).rejects.toThrow('停用');
    expect(
      (await service.findOne(1)).imageGenerationModelOptions[0],
    ).toMatchObject({
      available: false,
      unavailableReason: '文生图接口已停用',
    });
  });

  it('账号调用地址无效时保持候选可见但不可用，真实解析同样拒绝', async () => {
    const { service, provider } = imageHarness();
    provider.apiUrl = 'http://tokenhub.tencentmaas.com/v1';
    expect(
      (await service.findOne(1)).imageGenerationModelOptions[0],
    ).toMatchObject({ available: false });
    await expect(
      service.resolveAgentMediaTarget(1, 'ready', 'imageGeneration'),
    ).rejects.toThrow('HTTPS');
  });
});

function harness() {
  const routeResolver = new ModelEndpointsService(
    {} as Repository<ModelEndpoint>,
  );
  const provider = Object.assign(new KnowledgeAiProvider(), {
    id: 1,
    name: '腾讯账号',
    isEnabled: true,
    apiUrl: 'https://tokenhub.tencentmaas.com/v1',
    secretKey: 'test-key',
    models: 'chat-model',
    visionModels: 'vision-model',
    embeddingModels: 'embedding-model',
    imageGenerationModels: 'seedream-image-v5.0-pro',
    imageGenerationApiUrl: '',
    videoGenerationModels: 'video-model',
    videoGenerationApiUrl: '',
  });
  const repository = {
    findOne: jest.fn().mockResolvedValue(provider),
    find: jest.fn().mockResolvedValue([provider]),
    findAndCount: jest.fn().mockResolvedValue([[provider], 1]),
  };
  const endpoints = {
    findOne: jest.fn(),
    resolve: jest.fn().mockResolvedValue(null),
    imageRoutes: jest.fn().mockResolvedValue([]),
    resolveFromRows: routeResolver.resolveFromRows.bind(routeResolver),
    buildUrl: (base: string, path: string) => new URL(base).origin + path,
  };
  const service = new KnowledgeAiProvidersService(
    repository as unknown as Repository<KnowledgeAiProvider>,
    {} as Repository<AiFeatureConfig>,
    {} as LogRecordsService,
    endpoints as unknown as ModelEndpointsService,
  );
  return { service, endpoints, provider };
}

describe('账号按模型功能解析调用接口', () => {
  it('专用卡片测试使用同平台有效账号，无需先登记模型，业务目录校验仍保留', async () => {
    const { service, endpoints, provider } = harness();
    const route = {
      id: 9,
      platformType: 'tencentTokenhub',
      modelCode: 'seedream-image-v5.0-pro',
      functionType: 'imageToImage',
      protocol: 'tokenhubSeedreamImage',
      apiPath: '/v1/wand/si-image/generation',
      taskApiPath: '',
      executionMode: 'sync',
      isActive: true,
    };
    endpoints.findOne.mockResolvedValue(route);
    endpoints.resolve.mockResolvedValue(route);
    await expect(service.endpointTestAccounts(9)).resolves.toEqual([
      { id: 1, name: '腾讯账号' },
    ]);
    await expect(
      service.resolveEndpointTestTarget(9, 1),
    ).resolves.toMatchObject({
      functionType: 'imageToImage',
      model: 'seedream-image-v5.0-pro',
      url: 'https://tokenhub.tencentmaas.com/v1/wand/si-image/generation',
    });
    provider.imageGenerationModels = '';
    await expect(service.endpointTestAccounts(9)).resolves.toEqual([
      { id: 1, name: '腾讯账号' },
    ]);
    await expect(
      service.resolveEndpointTestTarget(9, 1),
    ).resolves.toMatchObject({
      model: 'seedream-image-v5.0-pro',
      url: 'https://tokenhub.tencentmaas.com/v1/wand/si-image/generation',
    });
    await expect(
      service.resolveMediaTarget(
        1,
        'seedream-image-v5.0-pro',
        'imageGeneration',
      ),
    ).rejects.toThrow('对应媒体模型目录');
    await expect(
      service.resolveEndpointTestTarget(9, 1, 'other-model'),
    ).rejects.toThrow('不能更换测试模型');
    provider.isEnabled = false;
    await expect(service.endpointTestAccounts(9)).resolves.toEqual([]);
    await expect(service.resolveEndpointTestTarget(9, 1)).rejects.toThrow(
      '未启用或未配置密钥',
    );
    provider.isEnabled = true;
    provider.secretKey = '   ';
    await expect(service.endpointTestAccounts(9)).resolves.toEqual([]);
    await expect(service.resolveEndpointTestTarget(9, 1)).rejects.toThrow(
      '未启用或未配置密钥',
    );
    provider.secretKey = 'test-key';
    provider.apiUrl = 'https://dashscope.aliyuncs.com';
    await expect(service.endpointTestAccounts(9)).resolves.toEqual([]);
    await expect(service.resolveEndpointTestTarget(9, 1)).rejects.toThrow(
      '平台不一致',
    );
  });

  it.each([
    ['chat', 'chat-model', 'chat'],
    ['contentCreation', 'chat-model', 'chat'],
    ['topicDiscovery', 'chat-model', 'chat'],
    ['visualPrompt', 'chat-model', 'chat'],
    ['documentParse', 'chat-model', 'chat'],
    ['rerank', 'chat-model', 'chat'],
    ['ocr', 'vision-model', 'vision'],
    ['embedding', 'embedding-model', 'embedding'],
    ['imageGeneration', 'seedream-image-v5.0-pro', 'textToImage'],
    ['videoGeneration', 'video-model', 'textToVideo'],
  ] as const)(
    '%s 编辑检查与实际调用共用场景解析',
    async (featureType, model, functionType) => {
      const { service, endpoints } = harness();
      endpoints.resolve.mockResolvedValue({
        apiPath: `/vendor/${functionType}`,
        protocol: 'openaiChat',
      });
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('编辑检查不得调用供应商'));
      try {
        const result = await service.inspectFeatureEndpoint({
          id: 1,
          model,
          featureType,
        });
        expect(result).toMatchObject({
          functionType,
          source: 'configured',
          url: `https://tokenhub.tencentmaas.com/vendor/${functionType}`,
        });
        expect(endpoints.resolve).toHaveBeenCalledWith(
          'tencentTokenhub',
          model,
          functionType,
        );
        const target =
          featureType === 'imageGeneration' || featureType === 'videoGeneration'
            ? await service.resolveMediaTarget(1, model, featureType)
            : featureType === 'ocr'
              ? await service.resolveVisionTarget({ id: 1, model })
              : featureType === 'embedding'
                ? await service.resolveEmbeddingTarget({ id: 1, model })
                : await service.resolveChatTarget({ id: 1, model });
        expect(target.url).toBe(result.url);
        expect(result).not.toHaveProperty('secretKey');
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
      }
    },
  );

  it('编辑检查只允许标准文本回退，缺失和停用媒体卡片不回退', async () => {
    const { service, endpoints } = harness();
    await expect(
      service.inspectFeatureEndpoint({
        id: 1,
        model: 'chat-model',
        featureType: 'chat',
      }),
    ).resolves.toMatchObject({
      source: 'standard',
      url: 'https://tokenhub.tencentmaas.com/v1/chat/completions',
    });
    await expect(
      service.inspectFeatureEndpoint({
        id: 1,
        model: 'seedream-image-v5.0-pro',
        featureType: 'imageGeneration',
      }),
    ).rejects.toThrow('文生图');
    await expect(
      service.inspectFeatureEndpoint({
        id: 1,
        model: 'video-model',
        featureType: 'videoGeneration',
      }),
    ).rejects.toThrow('文生视频');
    endpoints.resolve.mockRejectedValueOnce(
      new Error('当前模型功能的调用接口已停用'),
    );
    await expect(
      service.inspectFeatureEndpoint({
        id: 1,
        model: 'chat-model',
        featureType: 'chat',
      }),
    ).rejects.toThrow('已停用');
  });

  it('编辑检查拒绝未启用、缺密钥和不在对应目录的模型，保留账号原值', async () => {
    const { service, provider } = harness();
    const originalModels = provider.models;
    await expect(
      service.inspectFeatureEndpoint({
        id: 1,
        model: 'not-in-catalog',
        featureType: 'chat',
      }),
    ).rejects.toThrow('模型列表');
    expect(provider.models).toBe(originalModels);
    provider.isEnabled = false;
    await expect(
      service.inspectFeatureEndpoint({
        id: 1,
        model: 'chat-model',
        featureType: 'chat',
      }),
    ).rejects.toThrow('未启用');
    provider.isEnabled = true;
    provider.secretKey = '';
    await expect(
      service.inspectFeatureEndpoint({
        id: 1,
        model: 'chat-model',
        featureType: 'chat',
      }),
    ).rejects.toThrow('未配置密钥');
  });

  it('账号列表和详情由后端识别平台，不返回真实密钥', async () => {
    const { service } = harness();
    const view = await service.findOne(1);
    expect(view.platformType).toBe('tencentTokenhub');
    expect(view).not.toHaveProperty('secretKey');
    for (const field of [
      'chatApiPath',
      'imageGenerationProtocol',
      'imageGenerationApiUrl',
      'videoGenerationApiUrl',
    ]) {
      expect(view).not.toHaveProperty(field);
    }
    const result = await service.findAll({});
    expect(result.list[0].platformType).toBe('tencentTokenhub');
  });
  it('账号无统一生图地址仍可使用模型卡片，国际域名保持不变', async () => {
    const { service, endpoints, provider } = harness();
    provider.apiUrl = 'https://tokenhub-intl.tencentcloudmaas.com/v1';
    endpoints.resolve.mockResolvedValue({
      protocol: 'tokenhubSeedreamImage',
      apiPath: '/v1/wand/si-image/generation',
      executionMode: 'sync',
      taskApiPath: '',
    });
    await expect(
      service.resolveMediaTarget(
        1,
        'seedream-image-v5.0-pro',
        'imageGeneration',
        'imageToImage',
      ),
    ).resolves.toMatchObject({
      protocol: 'tokenhubSeedreamImage',
      url: 'https://tokenhub-intl.tencentcloudmaas.com/v1/wand/si-image/generation',
    });
    expect(endpoints.resolve).toHaveBeenCalledWith(
      'tencentTokenhub',
      'seedream-image-v5.0-pro',
      'imageToImage',
    );
  });
  it('内容封面与 Agent 候选认可模型级接口', async () => {
    const { service, endpoints } = harness();
    const route = {
      platformType: 'tencentTokenhub',
      modelCode: 'seedream-image-v5.0-pro',
      modelName: 'Seedream',
      functionType: 'textToImage',
      isActive: true,
      protocol: 'tokenhubSeedreamImage',
      apiPath: '/v1/wand/si-image/generation',
      executionMode: 'sync',
      taskApiPath: '',
    };
    endpoints.resolve.mockResolvedValue(route);
    endpoints.imageRoutes.mockResolvedValue([route]);
    await expect(service.resolveContentCoverTarget(1)).resolves.toMatchObject({
      protocol: 'tokenhubSeedreamImage',
    });
    await expect(service.findOne(1)).resolves.toMatchObject({
      imageEndpointModels: ['seedream-image-v5.0-pro'],
    });
  });
  it('普通调用、识图、向量化独立使用各自功能卡片', async () => {
    const { service, endpoints } = harness();
    endpoints.resolve.mockResolvedValue({ apiPath: '/v2/custom' });
    await expect(
      service.resolveChatTarget({ id: 1, model: 'chat-model' }),
    ).resolves.toMatchObject({
      url: 'https://tokenhub.tencentmaas.com/v2/custom',
    });
    expect(endpoints.resolve).toHaveBeenLastCalledWith(
      'tencentTokenhub',
      'chat-model',
      'chat',
    );
    await service.resolveVisionTarget({ id: 1, model: 'vision-model' });
    expect(endpoints.resolve).toHaveBeenLastCalledWith(
      'tencentTokenhub',
      'vision-model',
      'vision',
    );
    await service.resolveEmbeddingTarget({ id: 1, model: 'embedding-model' });
    expect(endpoints.resolve).toHaveBeenLastCalledWith(
      'tencentTokenhub',
      'embedding-model',
      'embedding',
    );
  });
  it('模型仍必须登记在账号对应能力目录，不能靠接口卡片越权调用', async () => {
    const { service, endpoints } = harness();
    await expect(
      service.resolveMediaTarget(1, 'not-authorized', 'imageGeneration'),
    ).rejects.toThrow('不在');
    expect(endpoints.resolve).not.toHaveBeenCalled();
  });

  it('没有媒体卡片时不使用历史账号地址，候选也不因旧地址而开放', async () => {
    const { service, provider } = harness();
    provider.imageGenerationApiUrl = 'https://legacy.example/images';
    provider.videoGenerationApiUrl = 'https://legacy.example/videos';
    await expect(
      service.resolveMediaTarget(
        1,
        'seedream-image-v5.0-pro',
        'imageGeneration',
      ),
    ).rejects.toThrow('模型厂商调用接口');
    await expect(
      service.resolveMediaTarget(1, 'video-model', 'videoGeneration'),
    ).rejects.toThrow('文生视频');
    await expect(service.findOne(1)).resolves.toMatchObject({
      imageEndpointModels: [],
    });
    await expect(service.resolveContentCoverTarget(1)).resolves.toBeNull();
  });

  it.each([
    [
      'https://tokenhub.tencentmaas.com',
      'https://tokenhub.tencentmaas.com/v1/chat/completions',
      'https://tokenhub.tencentmaas.com/v1/embeddings',
    ],
    [
      'https://dashscope.aliyuncs.com',
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings',
    ],
    [
      'https://old.cn-beijing.maas.aliyuncs.com/api/v1',
      'https://old.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions',
      'https://old.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/embeddings',
    ],
    [
      'https://gateway.example/proxy/v1',
      'https://gateway.example/proxy/v1/chat/completions',
      'https://gateway.example/proxy/v1/embeddings',
    ],
  ])(
    '基础地址 %s 自动解析标准 Chat 和向量接口',
    async (base, chat, embedding) => {
      const { service, provider } = harness();
      provider.apiUrl = base;
      provider.chatApiPath = 'old/unused/path';
      await expect(
        service.resolveChatTarget({ id: 1, model: 'chat-model' }),
      ).resolves.toMatchObject({ url: chat });
      await expect(
        service.resolveEmbeddingTarget({ id: 1, model: 'embedding-model' }),
      ).resolves.toMatchObject({ url: embedding });
    },
  );

  it('模型校验同样使用功能卡片，不再另走旧 Chat 路径', async () => {
    const { service, endpoints } = harness();
    endpoints.resolve.mockResolvedValue({ apiPath: '/v2/vision-check' });
    const fetcher = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}'));
    try {
      await service.validateModel({
        id: 1,
        model: 'vision-model',
        featureType: 'ocr',
      });
      expect(endpoints.resolve).toHaveBeenCalledWith(
        'tencentTokenhub',
        'vision-model',
        'vision',
      );
      expect(fetcher).toHaveBeenCalledWith(
        'https://tokenhub.tencentmaas.com/v2/vision-check',
        expect.objectContaining({ method: 'POST' }),
      );
    } finally {
      fetcher.mockRestore();
    }
  });
});
