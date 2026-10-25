import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Repository } from 'typeorm';
import { ModelEndpoint } from './entities/model-endpoint.entity';
import { ModelEndpointsService } from './model-endpoints.service';
import {
  BUILTIN_MODEL_ENDPOINTS,
  usesBuiltinModelEndpoint,
} from './model-endpoint.builtins';
import { MODEL_SPECIFIC_PRESETS } from './model-endpoint.presets';
import { QueryModelEndpointDto } from './dto/model-endpoint.dto';
import { KnowledgeAiProvider } from '../knowledge-ai-providers/entities/knowledge-ai-provider.entity';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import { ModelEndpointTestsService } from '../knowledge-ai-providers/model-endpoint-tests.service';
import type { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import type { LogRecordsService } from '../log-records/log-records.service';

function harness() {
  const overrides: ModelEndpoint[] = [];
  const repository = {
    findOne: jest.fn(({ where }: { where: Partial<ModelEndpoint> }) =>
      Promise.resolve(
        overrides.find(
          (row) =>
            !row.deletedAt &&
            Object.entries(where).every(
              ([key, value]) => row[key as keyof ModelEndpoint] === value,
            ),
        ) ?? null,
      ),
    ),
    find: jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(overrides.filter((row) => !row.deletedAt)),
      ),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    create: jest.fn((value: Partial<ModelEndpoint>) =>
      Object.assign(new ModelEndpoint(), value),
    ),
    save: jest.fn(),
  };
  const endpoints = new ModelEndpointsService(
    repository as unknown as Repository<ModelEndpoint>,
  );
  const provider = Object.assign(new KnowledgeAiProvider(), {
    id: 2,
    name: '百炼账号',
    isEnabled: true,
    secretKey: 'must-not-leak',
    apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: 'qwen3.8-flash#Flash\nqwen-plus#Plus',
    textModels: 'qwen-future',
    visionModels: 'qwen3-vl-plus',
    embeddingModels: 'text-embedding-v4',
    imageGenerationModels: '',
    videoGenerationModels: '',
  });
  const providerRepository = {
    findOne: jest.fn().mockResolvedValue(provider),
    find: jest.fn().mockResolvedValue([provider]),
  };
  const providers = new KnowledgeAiProvidersService(
    providerRepository as unknown as Repository<KnowledgeAiProvider>,
    {} as Repository<AiFeatureConfig>,
    {} as LogRecordsService,
    endpoints,
  );
  const tests = new ModelEndpointTestsService(providers, endpoints);
  const addOverride = (isActive: boolean) => {
    const row = Object.assign(new ModelEndpoint(), {
      id: 8,
      platformType: 'aliyunBailian',
      modelCode: 'qwen-plus',
      modelName: 'Plus 特殊入口',
      functionType: 'chat',
      protocol: 'openaiChat',
      apiPath: '/vendor/chat',
      taskApiPath: '',
      executionMode: 'sync',
      isActive,
    });
    overrides.push(row);
    return row;
  };
  return {
    endpoints,
    repository,
    providers,
    providerRepository,
    provider,
    tests,
    addOverride,
  };
}

describe('系统通用规则与模型专用覆盖', () => {
  afterEach(() => jest.restoreAllMocks());
  it('六张只读卡片无需数据库记录；筛选和分页不会混入专用配置', async () => {
    const { endpoints, repository } = harness();
    expect(await endpoints.findAll({ source: 'builtin' })).toMatchObject({
      total: 6,
    });
    const page = await endpoints.findAll({
      source: 'builtin',
      category: 'embedding',
      pageSize: 1,
      page: 2,
    });
    expect(page.total).toBe(2);
    expect(page.list).toHaveLength(1);
    expect(page.list[0]).toMatchObject({
      source: 'builtin',
      isReadOnly: true,
      functionType: 'embedding',
    });
    expect(
      await endpoints.findAll({
        source: 'builtin',
        platformType: 'aliyunBailian',
        keyword: '普通调用',
      }),
    ).toMatchObject({ total: 1 });
    expect(
      await endpoints.findAll({ source: 'builtin', isActive: false }),
    ).toEqual({ list: [], total: 0 });
    expect(repository.findAndCount).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
    await expect(endpoints.findOne(-1)).resolves.toMatchObject({
      isReadOnly: true,
    });
    await expect(endpoints.findOne(-999)).rejects.toThrow('不存在');
    expect(
      await validate(
        plainToInstance(QueryModelEndpointDto, { source: 'builtin' }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(QueryModelEndpointDto, { source: 'wildcard' }),
      ),
    ).not.toHaveLength(0);
  });

  it('系统规则在服务端拒绝编辑、删除及混合批量删除', async () => {
    const { endpoints, repository } = harness();
    await expect(endpoints.update(-1, { apiPath: '/evil' })).rejects.toThrow(
      '只读',
    );
    await expect(endpoints.remove(-1)).rejects.toThrow('只读');
    await expect(endpoints.batchRemove([8, -1])).rejects.toThrow('只读');
    expect(repository.findOne).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
    await expect(
      endpoints.create({ ...BUILTIN_MODEL_ENDPOINTS[0], modelCode: 'qwen*' }),
    ).rejects.toThrow('通配符');
  });

  it.each(['qwen3.8-flash', 'qwen-future'])(
    '新增版本 %s 原样传递，编辑检查与真实调用解析同一路径',
    async (model) => {
      const { endpoints, providers } = harness();
      const inspect = await providers.inspectFeatureEndpoint({
        id: 2,
        model,
        featureType: 'chat',
      });
      expect(inspect).toMatchObject({
        source: 'builtin',
        ruleName: '阿里云百炼 · 普通调用（系统通用）',
        url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      });
      const target = await providers.resolveChatTarget({ id: 2, model });
      expect(target.model).toBe(model);
      expect(target.url).toBe(inspect.url);
      expect(
        (await endpoints.resolve('aliyunBailian', model, 'chat'))?.id,
      ).toBe(-1);
    },
  );

  it('专用配置优先，停用后严格阻止，软删除后可回到系统规则', async () => {
    const { providers, addOverride } = harness();
    const row = addOverride(true);
    await expect(
      providers.inspectFeatureEndpoint({
        id: 2,
        model: 'qwen-plus',
        featureType: 'chat',
      }),
    ).resolves.toMatchObject({
      source: 'configured',
      url: 'https://dashscope.aliyuncs.com/vendor/chat',
    });
    row.isActive = false;
    await expect(
      providers.resolveChatTarget({ id: 2, model: 'qwen-plus' }),
    ).rejects.toThrow('停用');
    await expect(
      providers.resolveEndpointTestTarget(-1, 2, 'qwen-plus'),
    ).rejects.toThrow('停用');
    row.deletedAt = new Date();
    await expect(
      providers.inspectFeatureEndpoint({
        id: 2,
        model: 'qwen-plus',
        featureType: 'chat',
      }),
    ).resolves.toMatchObject({ source: 'builtin' });
  });

  it('通用规则不提供生图/视频兜底，识图和向量不能借用普通调用目录', async () => {
    const { providers, endpoints, provider } = harness();
    await expect(
      endpoints.resolve('aliyunBailian', 'qwen-image-plus', 'textToImage'),
    ).resolves.toBeNull();
    await expect(
      endpoints.resolve('tencentTokenhub', 'vidu-video-q2', 'textToVideo'),
    ).resolves.toBeNull();
    await expect(
      providers.resolveVisionTarget({ id: 2, model: 'qwen3.8-flash' }),
    ).rejects.toThrow('对应功能目录');
    await expect(
      providers.resolveEndpointTestTarget(-2, 2, 'qwen3.8-flash'),
    ).rejects.toThrow('能力目录');
    await expect(
      providers.resolveEndpointTestTarget(-3, 2, 'qwen3.8-flash'),
    ).rejects.toThrow('能力目录');
    provider.models = '';
    provider.textModels = '';
    await expect(
      providers.resolveChatTarget({ id: 2, model: 'qwen-plus' }),
    ).rejects.toThrow('对应功能目录');
  });

  it('通用卡片仅列出同平台有效账号和未被专用卡片覆盖的实际模型，不泄漏密钥', async () => {
    const { providers, providerRepository, provider, addOverride } = harness();
    addOverride(false);
    providerRepository.find.mockResolvedValue([
      provider,
      { ...provider, id: 3, isEnabled: false },
      { ...provider, id: 4, secretKey: '' },
      { ...provider, id: 5, apiUrl: 'https://tokenhub.tencentmaas.com' },
    ]);
    const accounts = await providers.endpointTestAccounts(-1);
    expect(accounts).toEqual([
      {
        id: 2,
        name: '百炼账号',
        apiPath: '/compatible-mode/v1/chat/completions',
        models: [
          { code: 'qwen3.8-flash', name: 'Flash' },
          { code: 'qwen-future', name: 'qwen-future' },
        ],
      },
    ]);
    expect(JSON.stringify(accounts)).not.toContain('must-not-leak');
    await expect(providers.endpointTestAccounts(-2)).resolves.toMatchObject([
      { models: [{ code: 'qwen3-vl-plus' }] },
    ]);
    provider.visionModels = '';
    await expect(providers.endpointTestAccounts(-2)).resolves.toEqual([]);
  });

  it('专用卡片新增后不能从通用测试入口绕过，未登记/空白/通配/跨平台模型均拒绝', async () => {
    const { providers, provider, addOverride } = harness();
    addOverride(true);
    await expect(
      providers.resolveEndpointTestTarget(-1, 2, 'qwen-plus'),
    ).rejects.toThrow('专用卡片');
    await expect(
      providers.resolveEndpointTestTarget(8, 2, 'qwen3.8-flash'),
    ).rejects.toThrow('不能更换');
    for (const model of [undefined, '*', 'qwen*', 'not-in-catalog'])
      await expect(
        providers.resolveEndpointTestTarget(-1, 2, model),
      ).rejects.toThrow();
    provider.apiUrl = 'https://tokenhub.tencentmaas.com';
    await expect(
      providers.resolveEndpointTestTarget(-1, 2, 'qwen3.8-flash'),
    ).rejects.toThrow('平台不一致');
  });

  it('通用卡片提交使用所选模型，幂等编号绑定模型，恢复结果也标明具体版本', async () => {
    const { tests } = harness();
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'OK' } }] }),
        ),
      );
    const dto = {
      providerId: 2,
      model: 'qwen3.8-flash',
      requestId: '06f107fb-4cd1-4ab7-914d-87045a060b42',
      requestBody: {
        model: 'client-forged-model',
        messages: [{ role: 'user', content: 'test' }],
        stream: true,
      },
    };
    const result = await tests.start(-1, dto, 7);
    expect(result).toMatchObject({
      status: 'succeeded',
      model: 'qwen3.8-flash',
      apiPath: '/compatible-mode/v1/chat/completions',
    });
    expect(JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)).toMatchObject(
      { model: 'qwen3.8-flash', stream: false },
    );
    await tests.start(-1, dto, 7);
    await expect(
      tests.start(-1, { ...dto, model: 'qwen-future' }, 7),
    ).rejects.toThrow('不能更换');
    expect((await tests.options(-1, 7)).recentTest?.result.model).toBe(
      'qwen3.8-flash',
    );
    expect((await tests.options(-1, 8)).recentTest).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('不同官方地域和专用域名保持账号来源，平台未知时不冒充内置规则', async () => {
    const { providers, provider } = harness();
    provider.apiUrl = 'https://old.ap-southeast-1.maas.aliyuncs.com/api/v1';
    provider.workspaceId = 'workspace';
    await expect(
      providers.resolveChatTarget({ id: 2, model: 'qwen3.8-flash' }),
    ).resolves.toMatchObject({
      url: 'https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions',
    });
    provider.apiUrl = 'https://coding.dashscope.aliyuncs.com/v1';
    await expect(
      providers.resolveEndpointTestTarget(-1, 2, 'qwen3.8-flash'),
    ).resolves.toMatchObject({
      url: 'https://coding.dashscope.aliyuncs.com/v1/chat/completions',
    });
    provider.apiUrl = 'https://tokenhub-intl.tencentmaas.com/v1';
    await expect(
      providers.inspectFeatureEndpoint({
        id: 2,
        model: 'qwen3.8-flash',
        featureType: 'chat',
      }),
    ).resolves.toMatchObject({
      source: 'builtin',
      url: 'https://tokenhub-intl.tencentmaas.com/v1/chat/completions',
    });
    provider.apiUrl = 'https://proxy.example/v1';
    await expect(
      providers.inspectFeatureEndpoint({
        id: 2,
        model: 'qwen3.8-flash',
        featureType: 'chat',
      }),
    ).resolves.toMatchObject({
      source: 'standard',
      url: 'https://proxy.example/v1/chat/completions',
    });
  });

  it('后续补充目录不再创建与通用规则相同的逐版本记录', () => {
    expect(MODEL_SPECIFIC_PRESETS).toHaveLength(186);
    expect(MODEL_SPECIFIC_PRESETS.some(usesBuiltinModelEndpoint)).toBe(false);
    expect(BUILTIN_MODEL_ENDPOINTS).toHaveLength(6);
  });
});
