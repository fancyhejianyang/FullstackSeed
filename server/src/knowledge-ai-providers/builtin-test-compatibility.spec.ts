import type { Repository } from 'typeorm';
import type { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import type { LogRecordsService } from '../log-records/log-records.service';
import { ModelEndpoint } from '../model-endpoints/entities/model-endpoint.entity';
import {
  FUNCTION_LABELS,
  type PlatformType,
} from '../model-endpoints/model-endpoint.constants';
import { ModelEndpointsService } from '../model-endpoints/model-endpoints.service';
import { isBuiltinModelEndpointTestCompatible } from '../model-endpoints/model-endpoint.builtins';
import { KnowledgeAiProvider } from './entities/knowledge-ai-provider.entity';
import { KnowledgeAiProvidersService } from './knowledge-ai-providers.service';
import { ModelEndpointTestsService } from './model-endpoint-tests.service';

const cases = [
  [
    '腾讯聊天',
    'tencentTokenhub',
    'https://tokenhub.tencentmaas.com/v1',
    -4,
    'chat',
    'hy3',
    '/v1/chat/completions',
  ],
  [
    '腾讯向量',
    'tencentTokenhub',
    'https://tokenhub.tencentmaas.com/v1',
    -6,
    'embedding',
    'kinfra-text-embedding-0.6b',
    '/v1/embeddings',
  ],
  [
    '百炼聊天',
    'aliyunBailian',
    'https://dashscope.aliyuncs.com/compatible-mode/v1',
    -1,
    'chat',
    'qwen-plus',
    '/compatible-mode/v1/chat/completions',
  ],
  [
    '百炼向量',
    'aliyunBailian',
    'https://dashscope.aliyuncs.com/compatible-mode/v1',
    -3,
    'embedding',
    'text-embedding-v4',
    '/compatible-mode/v1/embeddings',
  ],
  [
    '百炼 Coding',
    'aliyunBailian',
    'https://coding.dashscope.aliyuncs.com/v1',
    -1,
    'chat',
    'qwen-plus',
    '/v1/chat/completions',
  ],
  [
    '百炼套餐',
    'aliyunBailian',
    'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    -1,
    'chat',
    'qwen-plus',
    '/compatible-mode/v1/chat/completions',
  ],
] as const;
type Scenario = readonly [
  string,
  PlatformType,
  string,
  number,
  'chat' | 'embedding',
  string,
  string,
];

function harness(scenario: Scenario = cases[0]) {
  const [, platformType, apiUrl, builtinId, functionType, model, apiPath] =
    scenario;
  const rows: ModelEndpoint[] = [];
  const matches = (row: ModelEndpoint, where: Partial<ModelEndpoint>) =>
    !row.deletedAt &&
    Object.entries(where).every(
      ([key, value]) => row[key as keyof ModelEndpoint] === value,
    );
  const repository = {
    findOne: jest.fn(({ where }: { where: Partial<ModelEndpoint> }) =>
      Promise.resolve(rows.find((row) => matches(row, where)) ?? null),
    ),
    find: jest.fn(
      ({
        where,
        select,
      }: {
        where: Partial<ModelEndpoint>;
        select?: Partial<Record<keyof ModelEndpoint, boolean>>;
      }) =>
        Promise.resolve(
          rows
            .filter((row) => matches(row, where))
            .map((row) =>
              select
                ? Object.fromEntries(
                    Object.entries(select)
                      .filter(([, included]) => included)
                      .map(([key]) => [key, row[key as keyof ModelEndpoint]]),
                  )
                : row,
            ),
        ),
    ),
  };
  const endpoints = new ModelEndpointsService(
    repository as unknown as Repository<ModelEndpoint>,
  );
  const provider: KnowledgeAiProvider = Object.assign(
    new KnowledgeAiProvider(),
    {
      id: 2,
      name: scenario[0],
      apiUrl,
      isEnabled: true,
      secretKey: 'test-secret-never-for-network',
      models: functionType === 'chat' ? model : '',
      textModels: '',
      embeddingModels: functionType === 'embedding' ? model : '',
      visionModels: '',
      workspaceId: '',
    },
  );
  const providerRepository = {
    find: jest.fn().mockResolvedValue([provider]),
    findOne: jest.fn().mockResolvedValue(provider),
  };
  const providers = new KnowledgeAiProvidersService(
    providerRepository as unknown as Repository<KnowledgeAiProvider>,
    {} as Repository<AiFeatureConfig>,
    {} as LogRecordsService,
    endpoints,
  );
  const addOverride = (values: Partial<ModelEndpoint> = {}) => {
    const row = Object.assign(new ModelEndpoint(), {
      id: rows.length + 11,
      platformType,
      modelCode: model,
      modelName: '旧逐模型配置',
      functionType,
      protocol: functionType === 'chat' ? 'openaiChat' : 'openaiEmbedding',
      apiPath,
      taskApiPath: '',
      executionMode: 'sync',
      isActive: true,
      ...values,
    });
    rows.push(row);
    return row;
  };
  return {
    providers,
    endpoints,
    repository,
    providerRepository,
    provider,
    rows,
    addOverride,
    builtinId,
    model,
    apiPath,
    functionType,
  };
}

describe('通用测试兼容严格同格式的已启用聊天/向量专用卡', () => {
  beforeEach(() => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('本规格不得访问网络'));
  });
  afterEach(() => jest.restoreAllMocks());

  it.each(cases)(
    '%s 的旧专用配置不再把唯一账号全部过滤',
    async (...scenario) => {
      const {
        providers,
        endpoints,
        repository,
        providerRepository,
        provider,
        addOverride,
        builtinId,
        model,
        apiPath,
        functionType,
      } = harness(scenario);
      const row = addOverride();
      const original = { ...row };
      await expect(
        providers.endpointTestAccountOptions(builtinId),
      ).resolves.toEqual({
        accounts: [
          {
            id: 2,
            name: provider.name,
            apiPath,
            models: [{ code: model, name: model }],
          },
        ],
        excludedAccounts: [],
      });
      expect(repository.find).toHaveBeenCalledTimes(1);
      expect(repository.findOne).not.toHaveBeenCalled();
      expect(providerRepository.find).toHaveBeenCalledTimes(1);
      const url = new URL(provider.apiUrl).origin + apiPath;
      await expect(
        providers.resolveEndpointTestTarget(builtinId, 2, model),
      ).resolves.toMatchObject({
        model,
        url,
        source: 'configured',
        ruleName: row.modelName,
        functionLabel: FUNCTION_LABELS[functionType],
      });
      await expect(
        endpoints.resolve(row.platformType, model, functionType),
      ).resolves.toMatchObject({
        id: row.id,
        source: 'configured',
      });
      await expect(endpoints.findOne(builtinId)).resolves.toMatchObject({
        source: 'builtin',
      });
      expect(row).toEqual(original);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['停用', { isActive: false }],
    ['不同路径', { apiPath: '/vendor/chat' }],
    ['不同协议', { protocol: 'openaiResponses' }],
    ['不同执行方式', { executionMode: 'async' }],
    ['存在任务查询', { taskApiPath: '/vendor/tasks/{taskId}' }],
  ] as const)(
    '%s 的专用卡仍排除通用候选并拒绝直接提交',
    async (_label, values) => {
      const { providers, addOverride, builtinId, model } = harness();
      addOverride(values);
      await expect(
        providers.endpointTestAccountOptions(builtinId),
      ).resolves.toMatchObject({
        accounts: [],
        excludedAccounts: [{ id: 2, reasonCode: 'dedicatedOverride' }],
      });
      await expect(
        providers.resolveEndpointTestTarget(builtinId, 2, model),
      ).rejects.toThrow();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    },
  );

  it('同一账号保留无覆盖及等价模型，过滤停用和不同格式模型且不改模型目录', async () => {
    const { providers, provider, addOverride, builtinId } = harness();
    provider.models = 'hy3\nplain-model\ndisabled-model\nspecial-model';
    addOverride();
    addOverride({ modelCode: 'disabled-model', isActive: false });
    addOverride({ modelCode: 'special-model', apiPath: '/vendor/chat' });
    await expect(
      providers.endpointTestAccountOptions(builtinId),
    ).resolves.toMatchObject({
      accounts: [{ models: [{ code: 'hy3' }, { code: 'plain-model' }] }],
      excludedAccounts: [],
    });
    expect(provider.models).toBe(
      'hy3\nplain-model\ndisabled-model\nspecial-model',
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('候选读取后专用卡改为停用或不同路径，提交时重新解析并拒绝', async () => {
    const { providers, addOverride, builtinId, model } = harness();
    const row = addOverride();
    expect(
      (await providers.endpointTestAccountOptions(builtinId)).accounts,
    ).toHaveLength(1);
    row.isActive = false;
    await expect(
      providers.resolveEndpointTestTarget(builtinId, 2, model),
    ).rejects.toThrow('停用');
    row.isActive = true;
    row.apiPath = '/vendor/changed';
    await expect(
      providers.resolveEndpointTestTarget(builtinId, 2, model),
    ).rejects.toThrow('专用卡片');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('百炼 Coding 路径按账号最终路径比较，标准域名同字符串不能误判等价', async () => {
    const { providers, provider, addOverride, builtinId, model } = harness(
      cases[4],
    );
    const row = addOverride({
      apiPath: '/compatible-mode/v1/chat/completions',
    });
    await expect(
      providers.endpointTestAccountOptions(builtinId),
    ).resolves.toMatchObject({ accounts: [] });
    await expect(
      providers.resolveEndpointTestTarget(builtinId, 2, model),
    ).rejects.toThrow('专用卡片');
    row.apiPath = '/v1/chat/completions';
    await expect(
      providers.endpointTestAccountOptions(builtinId),
    ).resolves.toMatchObject({ accounts: [{ id: 2 }] });
    provider.apiUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    await expect(
      providers.endpointTestAccountOptions(builtinId),
    ).resolves.toMatchObject({ accounts: [] });
    await expect(
      providers.resolveEndpointTestTarget(builtinId, 2, model),
    ).rejects.toThrow('专用卡片');
  });

  it('兼容判断对异常地址和非聊天/向量功能关闭，不接受缺失启用状态', () => {
    const { provider, addOverride } = harness();
    const row = addOverride();
    const rule = {
      platformType: row.platformType,
      functionType: row.functionType,
    };
    for (const base of [
      'not-a-url',
      'http://tokenhub.tencentmaas.com/v1',
      'https://user:password@tokenhub.tencentmaas.com/v1',
      'https://tokenhub.tencentmaas.com/v1?key=value',
      'https://tokenhub.tencentmaas.com/v1#fragment',
      'https://proxy.example/v1',
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    ])
      expect(isBuiltinModelEndpointTestCompatible(base, rule, row)).toBe(false);
    expect(
      isBuiltinModelEndpointTestCompatible(provider.apiUrl, rule, {
        ...row,
        isActive: undefined,
      }),
    ).toBe(false);
    for (const functionType of ['vision', 'textToImage', 'webSearch'] as const)
      expect(
        isBuiltinModelEndpointTestCompatible(
          provider.apiUrl,
          { ...rule, functionType },
          { ...row, functionType },
        ),
      ).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('套餐工作空间不改写主机，空间型账号继续使用原工作空间解析', async () => {
    const { providers, provider, addOverride, builtinId, model, apiPath } =
      harness(cases[5]);
    addOverride();
    provider.workspaceId = 'workspace';
    await expect(
      providers.resolveEndpointTestTarget(builtinId, 2, model),
    ).resolves.toMatchObject({
      url: 'https://token-plan.cn-beijing.maas.aliyuncs.com' + apiPath,
    });
    provider.apiUrl =
      'https://old.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';
    await expect(
      providers.resolveEndpointTestTarget(builtinId, 2, model),
    ).resolves.toMatchObject({
      url: 'https://workspace.cn-beijing.maas.aliyuncs.com' + apiPath,
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('等价兼容不绕过账号目录、平台、启用、密钥或专用卡片的固定模型约束', async () => {
    const { providers, provider, addOverride, builtinId, model } = harness();
    const row = addOverride();
    await expect(
      providers.resolveEndpointTestTarget(row.id, 2, 'other-model'),
    ).rejects.toThrow('不能更换');
    provider.models = '';
    await expect(
      providers.endpointTestAccountOptions(builtinId),
    ).resolves.toMatchObject({
      accounts: [],
      excludedAccounts: [{ reasonCode: 'emptyCatalog' }],
    });
    await expect(
      providers.resolveEndpointTestTarget(builtinId, 2, model),
    ).rejects.toThrow('能力目录');
    provider.models = model;
    provider.secretKey = '';
    await expect(
      providers.endpointTestAccountOptions(builtinId),
    ).resolves.toMatchObject({
      accounts: [],
      excludedAccounts: [{ reasonCode: 'missingKey' }],
    });
    await expect(
      providers.resolveEndpointTestTarget(builtinId, 2, model),
    ).rejects.toThrow('密钥');
    provider.secretKey = 'test-key';
    provider.isEnabled = false;
    await expect(
      providers.endpointTestAccountOptions(builtinId),
    ).resolves.toEqual({ accounts: [], excludedAccounts: [] });
    await expect(
      providers.resolveEndpointTestTarget(builtinId, 2, model),
    ).rejects.toThrow('未启用');
    provider.isEnabled = true;
    provider.apiUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    await expect(
      providers.endpointTestAccountOptions(builtinId),
    ).resolves.toEqual({ accounts: [], excludedAccounts: [] });
    await expect(
      providers.resolveEndpointTestTarget(builtinId, 2, model),
    ).rejects.toThrow('平台不一致');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('结果保存实际专用来源，恢复和幂等重放不按入口重贴标签或重新计费', async () => {
    const { providers, endpoints, addOverride, builtinId, model, apiPath } =
      harness();
    const row = addOverride();
    const tests = new ModelEndpointTestsService(providers, endpoints);
    const fetchSpy = jest
      .mocked(globalThis.fetch)
      .mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'OK' } }] }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      );
    const dto = {
      providerId: 2,
      model,
      requestId: 'eb25d60d-c856-4357-8c86-f060768e2896',
      requestBody: {
        model: 'forged-model',
        messages: [{ role: 'user', content: 'test' }],
      },
    };
    const expected = {
      status: 'succeeded',
      source: 'configured',
      ruleName: '旧逐模型配置',
      apiPath,
      model,
    };
    await expect(tests.start(builtinId, dto, 7)).resolves.toMatchObject(
      expected,
    );
    expect(JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)).toMatchObject(
      { model },
    );
    row.modelName = '修改后规则';
    row.isActive = false;
    await expect(
      tests.query(builtinId, dto.requestId, 7),
    ).resolves.toMatchObject(expected);
    await expect(tests.start(builtinId, dto, 7)).resolves.toMatchObject(
      expected,
    );
    expect(
      (await tests.options(builtinId, 7)).recentTest?.result,
    ).toMatchObject(expected);
    expect((await tests.options(builtinId, 8)).recentTest).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
