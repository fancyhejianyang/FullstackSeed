import type { KnowledgeAiProvidersService } from './knowledge-ai-providers.service';
import type { ModelEndpointsService } from '../model-endpoints/model-endpoints.service';
import { ModelEndpointTestsService } from './model-endpoint-tests.service';
import { ModelEndpointTestsController } from './model-endpoint-tests.controller';
import {
  endpointTestTemplate,
  endpointTestResponse,
} from './model-endpoint-test.utils';
import type {
  ModelFunction,
  ModelProtocol,
} from '../model-endpoints/model-endpoint.constants';
import { PERMISSIONS_KEY } from '../common/decorators/require-permissions.decorator';
import {
  PROTOCOLS,
  protocolTaskMethod,
} from '../model-endpoints/model-endpoint.constants';

const requestId = 'b57b5e26-3c88-43b5-94e8-0489919c973f';
function harness(
  functionType: ModelFunction = 'chat',
  protocol: ModelProtocol = 'openaiChat',
) {
  const target = {
    model: 'saved-model',
    functionType,
    protocol,
    executionMode: PROTOCOLS[protocol].mode,
    taskMethod: protocolTaskMethod(protocol),
    url: 'https://provider.example/generate',
    taskUrlTemplate: 'https://provider.example/tasks/{taskId}',
    secretKey: 'never-return-this-key',
  };
  const providers = {
    resolveEndpointTestTarget: jest.fn().mockResolvedValue(target),
    endpointTestAccountOptions: jest.fn().mockResolvedValue({
      accounts: [{ id: 2, name: '测试账号' }],
      excludedAccounts: [],
    }),
  };
  const endpoints = {
    findOne: jest.fn().mockResolvedValue({
      id: 1,
      modelCode: target.model,
      functionType,
      protocol,
      isActive: true,
    }),
  };
  const service = new ModelEndpointTestsService(
    providers as unknown as KnowledgeAiProvidersService,
    endpoints as unknown as ModelEndpointsService,
  );
  const dto = {
    providerId: 2,
    requestId,
    requestBody: { model: 'client-model', messages: [], stream: true },
  };
  return { service, providers, target, dto };
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('模型接口卡片调试', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('测试与读取临时结果都要求卡片编辑权限', () => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, ModelEndpointTestsController),
    ).toEqual(['ModelEndpoint.update']);
  });

  it('测试选项一次读取候选和受控排除原因，读取不调用供应商', async () => {
    const { service, providers } = harness();
    const excludedAccounts = [
      {
        id: 3,
        name: '套餐账号',
        reasonCode: 'emptyCatalog',
        reason: '账号未配置对应功能模型目录',
      },
    ];
    providers.endpointTestAccountOptions.mockResolvedValue({
      accounts: [{ id: 2, name: '测试账号' }],
      excludedAccounts,
    });
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('测试选项读取不得发送网络请求'));
    await expect(service.options(1, 7)).resolves.toMatchObject({
      accounts: [{ id: 2, name: '测试账号' }],
      excludedAccounts,
    });
    expect(providers.endpointTestAccountOptions).toHaveBeenCalledTimes(1);
    expect(providers.endpointTestAccountOptions).toHaveBeenCalledWith(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([-2, -5])(
    '已移除的识图通用卡片 %s 不恢复或重放旧临时结果',
    async (id) => {
      const { service, dto, providers } = harness('vision');
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(json({ choices: [{ message: { content: 'OK' } }] }));
      // 模拟移除前已完成的记录；当前真实解析器已不接受这两个编号。
      await service.start(id, dto, 7);
      providers.resolveEndpointTestTarget.mockRejectedValue(
        new Error('系统通用规则不存在'),
      );
      await expect(service.query(id, requestId, 7)).rejects.toThrow('不存在');
      await expect(service.start(id, dto, 7)).rejects.toThrow(
        '系统通用规则不存在',
      );
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    },
  );

  it.each([-1, -3, -4, -6])(
    '保留的通用卡片 %s 仍可读取和幂等重放临时结果',
    async (id) => {
      const { service, dto } = harness();
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(json({ choices: [{ message: { content: 'OK' } }] }));
      await expect(service.start(id, dto, 7)).resolves.toMatchObject({
        status: 'succeeded',
      });
      await expect(service.query(id, requestId, 7)).resolves.toMatchObject({
        status: 'succeeded',
      });
      await expect(service.start(id, dto, 7)).resolves.toMatchObject({
        status: 'succeeded',
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    },
  );

  it('按已保存模型发送单次请求，强制非流式并脱敏响应，不修改账号', async () => {
    const { service, dto, providers } = harness();
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({
        choices: [{ message: { content: 'OK never-return-this-key' } }],
        authorization: 'sensitive',
      }),
    );
    const result = await service.start(1, dto, 7);
    expect(result.status).toBe('succeeded');
    expect(result.httpStatus).toBe(200);
    expect(result.responseBody).not.toContain('never-return-this-key');
    expect(result.responseBody).not.toContain('sensitive');
    const init = fetchSpy.mock.calls[0][1];
    expect(JSON.parse(init?.body as string)).toMatchObject({
      model: 'saved-model',
      stream: false,
    });
    expect(init?.redirect).toBe('error');
    expect(providers.resolveEndpointTestTarget).toHaveBeenCalledWith(1, 2);
    await expect(service.start(1, dto, 7)).resolves.toMatchObject({
      status: 'succeeded',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await expect(
      service.start(1, { ...dto, requestBody: { prompt: 'different' } }, 7),
    ).rejects.toThrow('不能更换');
  });

  it('空消息和无效向量不能因 HTTP 200 被判为成功', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ choices: [{ message: { content: [] } }] }))
      .mockResolvedValueOnce(json({ data: [{ embedding: ['wrong'] }] }));
    const chat = harness();
    await expect(chat.service.start(1, chat.dto, 7)).resolves.toMatchObject({
      status: 'unknown',
      httpStatus: 200,
    });
    const embedding = harness('embedding', 'openaiEmbedding');
    await expect(
      embedding.service.start(1, embedding.dto, 7),
    ).resolves.toMatchObject({ status: 'unknown' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('有效向量返回成功和实际维度', async () => {
    const { service, dto } = harness('embedding', 'openaiEmbedding');
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json({ data: [{ embedding: [0.1, 0.2] }] }));
    await expect(service.start(1, dto, 7)).resolves.toMatchObject({
      status: 'succeeded',
      message: expect.stringContaining('维度 2') as unknown,
    });
  });

  it('同步生图按所选协议校验结果字段，不把普通文本当图片', async () => {
    const { service, dto } = harness('textToImage', 'tokenhubSeedreamImage');
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        json({ data: [{ url: 'https://images.example/result.png' }] }),
      )
      .mockResolvedValueOnce(
        json({
          choices: [
            {
              message: { content: '这是图片 https://images.example/fake.png' },
            },
          ],
        }),
      );
    await expect(service.start(1, dto, 7)).resolves.toMatchObject({
      status: 'succeeded',
    });
    await expect(
      service.start(
        1,
        { ...dto, requestId: '7d15e2e6-c3ec-47d7-b828-51e6459a40e6' },
        7,
      ),
    ).resolves.toMatchObject({ status: 'unknown' });
  });

  it('请求尚未返回时重放同一测试只读取状态，不再次提交供应商', async () => {
    const { service, dto } = harness();
    let complete!: (response: Response) => void;
    const entered = { resolve: () => {} };
    const started = new Promise<void>((resolve) => {
      entered.resolve = resolve;
    });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      entered.resolve();
      return new Promise<Response>((resolve) => {
        complete = resolve;
      });
    });
    const pending = service.start(1, dto, 7);
    await started;
    await expect(service.start(1, dto, 7)).resolves.toMatchObject({
      status: 'running',
    });
    await expect(service.query(1, requestId, 7)).resolves.toMatchObject({
      status: 'running',
    });
    complete(json({ choices: [{ message: { content: 'OK' } }] }));
    await expect(pending).resolves.toMatchObject({ status: 'succeeded' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('Vidu 生图提交只判已受理，后续仅 GET 原任务直至完成', async () => {
    const { service, dto } = harness('textToImage', 'tokenhubViduImage');
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ task_id: 'task/a', state: 'created' }))
      .mockResolvedValueOnce(json({ state: 'processing' }))
      .mockResolvedValueOnce(
        json({
          state: 'success',
          creations: [{ url: 'https://images.example/test.png' }],
        }),
      );
    await expect(service.start(1, dto, 7)).resolves.toMatchObject({
      status: 'accepted',
      taskId: 'task/a',
    });
    await expect(service.query(1, requestId, 7)).resolves.toMatchObject({
      status: 'accepted',
    });
    await expect(service.query(1, requestId, 7)).resolves.toMatchObject({
      status: 'succeeded',
    });
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'GET',
      'GET',
    ]);
    expect(fetchSpy.mock.calls[1][0]).toBe(
      'https://provider.example/tasks/task%2Fa',
    );
    await service.query(1, requestId, 7);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
  it('3D POST 查询仅发送已保存模型和原任务编号，查询不会再次生成', async () => {
    const { service, dto, target } = harness('textTo3d', 'tokenhub3d');
    target.taskUrlTemplate = 'https://provider.example/query';
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ id: 'original-3d', status: 'queued' }))
      .mockResolvedValueOnce(json({ id: 'original-3d', status: 'in_progress' }))
      .mockResolvedValueOnce(
        json({
          id: 'original-3d',
          status: 'completed',
          output: { model_url: 'https://result.example/a.glb' },
        }),
      );
    await expect(service.start(1, dto, 7)).resolves.toMatchObject({
      status: 'accepted',
      taskId: 'original-3d',
    });
    await expect(service.query(1, requestId, 7)).resolves.toMatchObject({
      status: 'accepted',
    });
    await expect(service.query(1, requestId, 7)).resolves.toMatchObject({
      status: 'succeeded',
    });
    expect(
      fetchSpy.mock.calls
        .slice(1)
        .map(([url, init]) => [
          url,
          init?.method,
          JSON.parse(init?.body as string) as unknown,
        ]),
    ).toEqual([
      [
        'https://provider.example/query',
        'POST',
        { model: 'saved-model', id: 'original-3d' },
      ],
      [
        'https://provider.example/query',
        'POST',
        { model: 'saved-model', id: 'original-3d' },
      ],
    ]);
    await service.start(1, dto, 7);
    await service.query(1, requestId, 7);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
  it('多模态向量采用同一向量校验，空响应不能成功', async () => {
    const { service, dto } = harness(
      'multimodalEmbedding',
      'tokenhubMultimodalEmbedding',
    );
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json({ data: [{ embedding: [0.1, 0.2, 0.3] }] }));
    await expect(service.start(1, dto, 7)).resolves.toMatchObject({
      status: 'succeeded',
    });
  });

  it.each([
    'tokenhubHunyuanVideo',
    'tokenhubViduVideo',
    'dashscopeVideo',
  ] as const)(
    '%s 视频受理后按卡片查询，状态失败不冒充成功',
    async (protocol) => {
      const { service, dto } = harness('textToVideo', protocol);
      const receipt =
        protocol === 'dashscopeVideo'
          ? { output: { task_id: 'video-1' } }
          : { task_id: 'video-1' };
      const failure =
        protocol === 'dashscopeVideo'
          ? { output: { task_status: 'FAILED' } }
          : protocol === 'tokenhubHunyuanVideo'
            ? { status: 'failed' }
            : { state: 'failed' };
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(json(receipt))
        .mockResolvedValueOnce(json(failure));
      await expect(service.start(1, dto, 7)).resolves.toMatchObject({
        status: 'accepted',
      });
      await expect(service.query(1, requestId, 7)).resolves.toMatchObject({
        status: 'failed',
      });
      expect(fetchSpy.mock.calls[1][1]?.method).toBe('GET');
      if (protocol === 'dashscopeVideo')
        expect(fetchSpy.mock.calls[0][1]?.headers).toMatchObject({
          'X-DashScope-Async': 'enable',
        });
    },
  );

  it('测试结果按用户和卡片隔离，重新打开只恢复本人的最近记录', async () => {
    const { service, dto } = harness();
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json({ choices: [{ message: { content: 'OK' } }] }));
    await service.start(1, dto, 7);
    await expect(service.query(1, requestId, 8)).rejects.toThrow('不存在');
    await expect(service.query(2, requestId, 7)).rejects.toThrow('不存在');
    expect((await service.options(1, 7)).recentTest?.result.status).toBe(
      'succeeded',
    );
    expect((await service.options(1, 8)).recentTest).toBeNull();
  });

  it('提交回执已明确失败时立即显示失败，不暂时冒充生成中', async () => {
    const { service, dto } = harness('textToVideo', 'tokenhubViduVideo');
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json({ task_id: 'video-1', state: 'failed' }));
    await expect(service.start(1, dto, 7)).resolves.toMatchObject({
      status: 'failed',
      taskId: 'video-1',
    });
    await service.query(1, requestId, 7);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('查询失败保留任务编号，路径变化后不访问新路径或重新生成', async () => {
    const { service, dto, target } = harness(
      'textToVideo',
      'tokenhubViduVideo',
    );
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ task_id: 'video-1' }))
      .mockResolvedValueOnce(json({ error: 'rate_limited' }, 429));
    await service.start(1, dto, 7);
    await expect(service.query(1, requestId, 7)).resolves.toMatchObject({
      status: 'unknown',
      taskId: 'video-1',
    });
    target.taskUrlTemplate = 'https://provider.example/changed/{taskId}';
    await expect(service.query(1, requestId, 7)).resolves.toMatchObject({
      status: 'unknown',
      taskId: 'video-1',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('查询返回 HTML 错误时保留原任务为待核实，不判定生成失败', async () => {
    const { service, dto } = harness('textToImage', 'tokenhubViduImage');
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ state: 'created', task_id: 'image-1' }))
      .mockResolvedValueOnce(
        new Response('<html>gateway error</html>', { status: 502 }),
      )
      .mockResolvedValueOnce(json({ unexpected: true }));
    await service.start(1, dto, 7);
    await expect(service.query(1, requestId, 7)).resolves.toMatchObject({
      status: 'unknown',
      taskId: 'image-1',
      httpStatus: 502,
    });
    await expect(service.query(1, requestId, 7)).resolves.toMatchObject({
      status: 'unknown',
      taskId: 'image-1',
    });
  });

  it('网络异常、鉴权错误和 HTML 响应保留真实 HTTP/未知状态，不自动重试', async () => {
    const { service, dto } = harness();
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('network secret'))
      .mockResolvedValueOnce(json({ error: 'unauthorized' }, 401))
      .mockResolvedValueOnce(new Response('<html>bad</html>', { status: 200 }));
    await expect(service.start(1, dto, 7)).resolves.toMatchObject({
      status: 'unknown',
      httpStatus: null,
    });
    await expect(
      service.start(
        1,
        { ...dto, requestId: '7d15e2e6-c3ec-47d7-b828-51e6459a40e6' },
        7,
      ),
    ).resolves.toMatchObject({ status: 'failed', httpStatus: 401 });
    await expect(
      service.start(
        1,
        { ...dto, requestId: 'e4fc4924-9b99-4ec5-86bf-765cf0ff8d44' },
        7,
      ),
    ).resolves.toMatchObject({ status: 'unknown', httpStatus: 200 });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('占位符、大请求与账号校验失败在请求供应商前阻止', async () => {
    const { service, dto, providers } = harness();
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    await expect(
      service.start(
        1,
        { ...dto, requestBody: { image: 'REPLACE_WITH_IMAGE_URL' } },
        7,
      ),
    ).rejects.toThrow('占位符');
    await expect(
      service.start(1, { ...dto, requestBody: { text: 'x'.repeat(65537) } }, 7),
    ).rejects.toThrow('64 KB');
    providers.resolveEndpointTestTarget.mockRejectedValueOnce(
      new Error('接口已停用'),
    );
    await expect(service.start(1, dto, 7)).rejects.toThrow('已停用');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('模板覆盖全部功能场景并复用实际生成协议', () => {
    const scenes: Array<[ModelFunction, ModelProtocol]> = [
      ['chat', 'openaiChat'],
      ['vision', 'openaiChat'],
      ['embedding', 'openaiEmbedding'],
      ['textToImage', 'tokenhubSeedreamImage'],
      ['imageToImage', 'tokenhubHunyuanImageChat'],
      ['textToVideo', 'tokenhubHunyuanVideo'],
      ['imageToVideo', 'tokenhubViduVideo'],
      ['referenceToVideo', 'dashscopeVideo'],
      ['startEndToVideo', 'tokenhubViduVideo'],
    ];
    for (const [functionType, protocol] of scenes)
      expect(
        endpointTestTemplate({
          modelCode: 'saved-model',
          functionType,
          protocol,
        }),
      ).toMatchObject({ model: 'saved-model' });
    expect(() =>
      endpointTestTemplate({
        modelCode: 'qwen-plus',
        functionType: 'webSearch',
        protocol: 'openaiResponses',
      }),
    ).toThrow('联网搜索接口卡片已移除');
    expect(
      endpointTestTemplate({
        modelCode: 'vidu-video-q2-pro',
        functionType: 'startEndToVideo',
        protocol: 'tokenhubViduVideo',
      }),
    ).toMatchObject({
      images: ['REPLACE_WITH_IMAGE_URL', 'REPLACE_WITH_LAST_FRAME_URL'],
    });
    const response = endpointTestResponse(
      {
        b64_json: 'x'.repeat(5000),
        embedding: [1, 2],
        key: 'Bearer token',
        secret: 'hidden',
        text: 'real-key',
      },
      'real-key',
    );
    expect(response).not.toContain('real-key');
    expect(response).not.toContain('hidden');
    expect(response.length).toBeLessThan(1000);
  });
});
