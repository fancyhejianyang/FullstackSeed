import { randomUUID } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Repository } from 'typeorm';
import { ModelEndpointTestsService } from './model-endpoint-tests.service';
import { KnowledgeAiProvidersService } from './knowledge-ai-providers.service';
import { KnowledgeAiProvider } from './entities/knowledge-ai-provider.entity';
import { ModelEndpointsService } from '../model-endpoints/model-endpoints.service';
import type { ModelEndpoint } from '../model-endpoints/entities/model-endpoint.entity';
import type { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import type { LogRecordsService } from '../log-records/log-records.service';
import type {
  ModelFunction,
  ModelProtocol,
} from '../model-endpoints/model-endpoint.constants';
import { PROTOCOLS } from '../model-endpoints/model-endpoint.constants';
import { AiFeatureConfigsController } from '../ai-feature-configs/ai-feature-configs.controller';
import { TestAiFeatureModelDto } from '../ai-feature-configs/dto/ai-feature-config.dto';
import { PERMISSIONS_KEY } from '../common/decorators/require-permissions.decorator';
import * as vision from '../agent-apps/agent-media-probe';

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const dto = (
  values: Partial<TestAiFeatureModelDto> = {},
): TestAiFeatureModelDto => ({
  providerId: 2,
  model: 'selected-model',
  featureType: 'chat',
  requestId: randomUUID(),
  ...values,
});

function harness(
  functionType: ModelFunction = 'chat',
  protocol: ModelProtocol = 'openaiChat',
) {
  const target = {
    model: 'selected-model',
    functionType,
    protocol,
    executionMode: PROTOCOLS[protocol].mode,
    taskMethod: 'GET' as const,
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    taskUrlTemplate: 'https://dashscope.aliyuncs.com/tasks/{taskId}',
    secretKey: 'never-return-this-key',
    functionLabel: '接口功能',
    ruleName: '当前规则',
    source: 'builtin' as const,
  };
  const providers = {
    resolveFeatureTestTarget: jest
      .fn()
      .mockImplementation((selection: { model: string }) =>
        Promise.resolve({ ...target, model: selection.model }),
      ),
    resolveEndpointTestTarget: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ ...target })),
    endpointTestAccounts: jest
      .fn()
      .mockResolvedValue([{ id: 2, name: '测试账号' }]),
  };
  const endpoints = {
    findOne: jest.fn().mockResolvedValue({
      id: 1,
      modelCode: target.model,
      functionType,
      protocol,
      isActive: true,
      source: 'configured',
    }),
  };
  const service = new ModelEndpointTestsService(
    providers as unknown as KnowledgeAiProvidersService,
    endpoints as unknown as ModelEndpointsService,
  );
  return { service, providers, target };
}

describe('AI 功能配置真实模型接口测试', () => {
  afterEach(() => jest.restoreAllMocks());

  it('独立入口沿用 AI 配置权限，不要求厂商卡片编辑权限，DTO 不接受地址/凭据/业务提示词', async () => {
    for (const name of ['testModel', 'recentModelTests', 'queryModelTest']) {
      expect(
        Reflect.getMetadata(
          PERMISSIONS_KEY,
          Object.getOwnPropertyDescriptor(
            AiFeatureConfigsController.prototype,
            name,
          )!.value as object,
        ),
      ).toEqual(['Menu.read']);
    }
    const payload = plainToInstance(TestAiFeatureModelDto, {
      ...dto(),
      apiUrl: 'https://evil.example',
      secretKey: 'client-key',
      systemPrompt: 'private business',
      requestBody: {},
    });
    expect(await validate(payload, { whitelist: true })).toHaveLength(0);
    for (const key of ['apiUrl', 'secretKey', 'systemPrompt', 'requestBody'])
      expect(payload).not.toHaveProperty(key);
  });

  it.each([
    'chat',
    'contentCreation',
    'visualPrompt',
    'documentParse',
    'rerank',
  ] as const)(
    '%s 只执行固定接口样例，幂等重放不再次调用',
    async (featureType) => {
      const { service, providers } = harness();
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() =>
          Promise.resolve(
            json({ choices: [{ message: { content: '接口测试成功。' } }] }),
          ),
        );
      const request = dto({ featureType });
      await expect(service.startFeature(request, 7)).resolves.toMatchObject({
        status: 'succeeded',
        model: request.model,
        featureType,
        providerId: 2,
        ruleName: '当前规则',
      });
      await service.startFeature(request, 7);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const body: unknown = JSON.parse(
        fetchSpy.mock.calls[0][1]?.body as string,
      );
      expect(body).toMatchObject({
        model: request.model,
        stream: false,
        messages: [{ role: 'user', content: '请仅回复：接口测试成功。' }],
      });
      expect(providers.resolveFeatureTestTarget).toHaveBeenCalledWith({
        id: 2,
        model: request.model,
        featureType,
      });
    },
  );

  it('MinerU OCR 测试整理文本模型，不调用 MinerU 或误测视觉模型', async () => {
    const { service, providers } = harness();
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json({ choices: [{ message: { content: 'OK' } }] }));
    await service.startFeature(dto({ featureType: 'ocr', useMineru: true }), 7);
    expect(providers.resolveFeatureTestTarget).toHaveBeenCalledWith({
      id: 2,
      model: 'selected-model',
      featureType: 'documentParse',
    });
  });

  it('随机 OCR 探针仅在新请求生成一次，核验色块结果而非把任意文本判成功', async () => {
    const { service } = harness('vision');
    const challenge = jest
      .spyOn(vision, 'createVisionChallenge')
      .mockReturnValue({
        data: Buffer.from('test-image'),
        mimeType: 'image/png',
        question: 'Read colors',
        matches: (answer) => answer === 'verified-colors',
      });
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        json({ choices: [{ message: { content: 'verified-colors' } }] }),
      )
      .mockResolvedValueOnce(
        json({ choices: [{ message: { content: 'OK' } }] }),
      );
    const request = dto({ featureType: 'ocr' });
    await expect(service.startFeature(request, 7)).resolves.toMatchObject({
      status: 'succeeded',
    });
    await service.startFeature(request, 7);
    expect(challenge).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)).toMatchObject(
      {
        messages: [
          {
            content: [
              { type: 'text', text: 'Read colors' },
              {
                type: 'image_url',
                image_url: {
                  url: expect.stringContaining(
                    'data:image/png;base64,',
                  ) as unknown,
                },
              },
            ],
          },
        ],
      },
    );
    await expect(
      service.startFeature(dto({ featureType: 'ocr' }), 7),
    ).resolves.toMatchObject({
      status: 'unknown',
      message: expect.stringContaining('未通过核验') as unknown,
    });
  });

  it('欠费错误先于 OCR/协议成功校验，并沿用脱敏与目录保留语义', async () => {
    const { service } = harness('vision');
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      json(
        {
          error: {
            message:
              'Access to model denied. Please make sure you are eligible for using the model',
            api_key: 'never-return-this-key',
          },
        },
        403,
      ),
    );
    const result = await service.startFeature(dto({ featureType: 'ocr' }), 7);
    expect(result).toMatchObject({
      status: 'failed',
      message: '大模型账号已欠费，请充值后重试。',
    });
    expect(result.responseBody).not.toContain('never-return-this-key');
  });

  it('卡片和功能记录双向隔离，恢复列表只能读取本人的功能测试', async () => {
    const { service } = harness();
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(json({ choices: [{ message: { content: 'OK' } }] })),
      );
    const feature = dto();
    await service.startFeature(feature, 7);
    const cardId = randomUUID();
    await service.start(
      1,
      { providerId: 2, requestId: cardId, requestBody: {} },
      7,
    );
    await expect(service.query(0, feature.requestId, 7)).rejects.toThrow(
      '不存在',
    );
    await expect(service.queryFeature(cardId, 7)).rejects.toThrow('不存在');
    await expect(service.queryFeature(feature.requestId, 8)).rejects.toThrow(
      '不存在',
    );
    await expect(
      service.start(
        1,
        { providerId: 2, requestId: feature.requestId, requestBody: {} },
        7,
      ),
    ).rejects.toThrow('不能更换');
    expect(service.recentFeatures(7)).toHaveLength(1);
    expect(service.recentFeatures(8)).toEqual([]);
    expect((await service.options(1, 7)).recentTest?.result.requestId).toBe(
      cardId,
    );
  });

  it('异步视频仅查询原任务，查询失败仍保留编号，接口改变后不访问新路径', async () => {
    const { service, target } = harness('textToVideo', 'tokenhubViduVideo');
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        json({ task_id: 'original/task', state: 'created' }),
      )
      .mockResolvedValueOnce(json({ error: 'rate limit' }, 429))
      .mockResolvedValueOnce(
        json({
          state: 'success',
          creations: [{ url: 'https://result.example/a.mp4' }],
        }),
      );
    const request = dto({ featureType: 'videoGeneration' });
    await expect(service.startFeature(request, 7)).resolves.toMatchObject({
      status: 'accepted',
      taskId: 'original/task',
    });
    await expect(
      service.queryFeature(request.requestId, 7),
    ).resolves.toMatchObject({ status: 'unknown', taskId: 'original/task' });
    await expect(
      service.queryFeature(request.requestId, 7),
    ).resolves.toMatchObject({ status: 'succeeded' });
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'GET',
      'GET',
    ]);
    expect(fetchSpy.mock.calls[1][0]).toBe(
      'https://dashscope.aliyuncs.com/tasks/original%2Ftask',
    );
    const next = dto({ featureType: 'videoGeneration' });
    fetchSpy.mockResolvedValueOnce(json({ task_id: 'next', state: 'created' }));
    await service.startFeature(next, 7);
    target.taskUrlTemplate = 'https://dashscope.aliyuncs.com/new/{taskId}';
    await expect(
      service.queryFeature(next.requestId, 7),
    ).resolves.toMatchObject({ status: 'unknown' });
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it('生图按生成协议真实提交并验证结果，不下载或保存业务素材', async () => {
    const { service } = harness('textToImage', 'tokenhubSeedreamImage');
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        json({ data: [{ url: 'https://result.example/a.png' }] }),
      );
    await expect(
      service.startFeature(dto({ featureType: 'imageGeneration' }), 7),
    ).resolves.toMatchObject({ status: 'succeeded' });
    expect(JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)).toMatchObject(
      { model: 'selected-model', prompt: expect.any(String) as unknown },
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('联网功能实际调用 Responses+web_search，普通回答无搜索证据不能算成功', async () => {
    const { service } = harness();
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ output_text: '普通回答' }))
      .mockResolvedValueOnce(
        json({
          output: [
            { type: 'web_search_call', status: 'completed' },
            { type: 'message', content: [{ text: '检索答案' }] },
          ],
        }),
      );
    const request = dto({
      featureType: 'topicDiscovery',
      webSearchMode: 'bailianResponses',
    });
    await expect(service.startFeature(request, 7)).resolves.toMatchObject({
      status: 'unknown',
      functionLabel: '联网搜索',
    });
    expect(fetchSpy.mock.calls[0][0]).toBe(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/responses',
    );
    expect(JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)).toMatchObject(
      { model: request.model, tools: [{ type: 'web_search' }], stream: false },
    );
    await expect(
      service.startFeature({ ...request, requestId: randomUUID() }, 7),
    ).resolves.toMatchObject({ status: 'succeeded' });
    await expect(
      service.startFeature(
        dto({ featureType: 'topicDiscovery', webSearchMode: 'bailianChat' }),
        7,
      ),
    ).rejects.toThrow('Responses');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('所有入口共享并发限制，最近列表最多十条且不暴露请求体和凭据', async () => {
    const { service } = harness();
    let clock = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(json({ choices: [{ message: { content: 'OK' } }] })),
      );
    for (let i = 0; i < 12; i++) {
      clock += 11000;
      await service.startFeature(dto(), 7);
    }
    const list = service.recentFeatures(7);
    expect(list).toHaveLength(10);
    expect(JSON.stringify(list)).not.toContain('never-return-this-key');
    for (const result of list) expect(result).not.toHaveProperty('requestBody');
    let finish!: (value: Response) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    clock += 61000;
    fetchSpy.mockImplementationOnce(() => {
      entered();
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    });
    const pending = service.startFeature(dto(), 7);
    await started;
    await expect(
      service.start(
        1,
        { providerId: 2, requestId: randomUUID(), requestBody: {} },
        7,
      ),
    ).rejects.toThrow('已有测试');
    finish(json({ choices: [{ message: { content: 'OK' } }] }));
    await pending;
  });
});

describe('功能测试目标使用实际规则解析', () => {
  it('通用/专用路径、账号目录与停用判断均复用正式调用，测试目标不接受客户端地址', async () => {
    const provider = Object.assign(new KnowledgeAiProvider(), {
      id: 2,
      isEnabled: true,
      secretKey: 'server-key',
      apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      models: 'qwen3.7-plus',
      visionModels: 'qwen-vl-plus',
    });
    const row = {
      id: 9,
      modelCode: 'qwen3.7-plus',
      functionType: 'chat',
      protocol: 'openaiChat',
      apiPath: '/private/chat',
      executionMode: 'sync',
      taskApiPath: '',
      isActive: true,
    };
    const repository = { findOne: jest.fn().mockResolvedValue(null) };
    const endpoints = new ModelEndpointsService(
      repository as unknown as Repository<ModelEndpoint>,
    );
    const providers = new KnowledgeAiProvidersService(
      {
        findOne: jest.fn().mockResolvedValue(provider),
      } as unknown as Repository<KnowledgeAiProvider>,
      {} as Repository<AiFeatureConfig>,
      {} as LogRecordsService,
      endpoints,
    );
    await expect(
      providers.resolveFeatureTestTarget({
        id: 2,
        model: 'qwen3.7-plus',
        featureType: 'chat',
      }),
    ).resolves.toMatchObject({
      source: 'builtin',
      url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    });
    repository.findOne.mockResolvedValue(row);
    await expect(
      providers.resolveFeatureTestTarget({
        id: 2,
        model: 'qwen3.7-plus',
        featureType: 'chat',
      }),
    ).resolves.toMatchObject({
      source: 'configured',
      url: 'https://dashscope.aliyuncs.com/private/chat',
    });
    row.isActive = false;
    await expect(
      providers.resolveFeatureTestTarget({
        id: 2,
        model: 'qwen3.7-plus',
        featureType: 'chat',
      }),
    ).rejects.toThrow('停用');
    await expect(
      providers.resolveFeatureTestTarget({
        id: 2,
        model: 'not-in-catalog',
        featureType: 'chat',
      }),
    ).rejects.toThrow('模型列表');
    provider.isEnabled = false;
    await expect(
      providers.resolveFeatureTestTarget({
        id: 2,
        model: 'qwen3.7-plus',
        featureType: 'chat',
      }),
    ).rejects.toThrow('未启用');
  });
});
