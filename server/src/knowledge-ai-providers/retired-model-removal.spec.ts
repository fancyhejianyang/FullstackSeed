import { randomUUID } from 'node:crypto';
import type { Repository } from 'typeorm';
import { KnowledgeAiProvidersService } from './knowledge-ai-providers.service';
import { KnowledgeAiProvider } from './entities/knowledge-ai-provider.entity';
import { ModelEndpointTestsService } from './model-endpoint-tests.service';
import type { ModelEndpointsService } from '../model-endpoints/model-endpoints.service';
import type { LogRecordsService } from '../log-records/log-records.service';
import type { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';

const officialUrl = 'https://tokenhub.tencentmaas.com/v1/chat/completions';
const model = 'selected-model';
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function providerHarness() {
  const provider = Object.assign(new KnowledgeAiProvider(), {
    id: 1,
    name: '当前账号',
    apiUrl: 'https://tokenhub.tencentmaas.com/v1',
    secretKey: 'Bearer saved-key',
    isEnabled: true,
    models: `${model}#旧版本\nselected-model-next#新版本`,
    textModels: model,
    visionModels: `${model}\nvision-model`,
    imageGenerationModels: model,
    videoGenerationModels: model,
    embeddingModels: model,
  });
  const store = {
    findOne: jest.fn().mockImplementation(() => Promise.resolve(provider)),
    update: jest
      .fn()
      .mockImplementation(
        (_where: unknown, patch: Partial<KnowledgeAiProvider>) => {
          Object.assign(provider, patch);
          return Promise.resolve({ affected: 1 });
        },
      ),
  };
  const manager = { getRepository: jest.fn().mockReturnValue(store) };
  const repository = {
    manager: {
      transaction: jest
        .fn()
        .mockImplementation(
          (run: (value: typeof manager) => Promise<unknown>) => run(manager),
        ),
    },
    findOne: jest.fn().mockImplementation(() => Promise.resolve(provider)),
    update: jest
      .fn()
      .mockImplementation(
        (_where: unknown, patch: Partial<KnowledgeAiProvider>) => {
          Object.assign(provider, patch);
          return Promise.resolve({ affected: 1 });
        },
      ),
    save: jest.fn().mockImplementation((value: KnowledgeAiProvider) => {
      Object.assign(provider, value);
      return Promise.resolve(provider);
    }),
  };
  const featureRepository = { update: jest.fn() };
  const service = new KnowledgeAiProvidersService(
    repository as unknown as Repository<KnowledgeAiProvider>,
    featureRepository as unknown as Repository<AiFeatureConfig>,
    {} as LogRecordsService,
  );
  const request = {
    providerId: 1,
    model,
    url: officialUrl,
    secretKey: 'saved-key',
  };
  return { service, provider, store, repository, request, featureRepository };
}

function runnerHarness() {
  const target = {
    model,
    functionType: 'chat' as const,
    protocol: 'openaiChat' as const,
    executionMode: 'sync' as const,
    taskMethod: 'GET' as const,
    url: officialUrl,
    taskUrlTemplate: null as string | null,
    secretKey: 'saved-key',
  };
  const providers = {
    resolveFeatureTestTarget: jest.fn().mockResolvedValue(target),
    resolveEndpointTestTarget: jest.fn().mockResolvedValue(target),
    removeRetiredModel: jest.fn().mockResolvedValue(true),
  };
  const service = new ModelEndpointTestsService(
    providers as unknown as KnowledgeAiProvidersService,
    {} as ModelEndpointsService,
  );
  const requestId = randomUUID();
  const feature = {
    providerId: 1,
    model,
    featureType: 'chat' as const,
    requestId,
  };
  const card = { providerId: 1, requestId, requestBody: { messages: [] } };
  return { service, providers, target, feature, card };
}

describe('官方退役模型从账号目录清理', () => {
  afterEach(() => jest.restoreAllMocks());

  it('事务锁读取当前账号，精确清理全部目录并保留相似版本和其他配置', async () => {
    const { service, provider, store, request, featureRepository } =
      providerHarness();
    await expect(service.removeRetiredModel(request)).resolves.toBe(true);
    expect(store.findOne).toHaveBeenCalledWith({
      where: { id: 1 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(store.update).toHaveBeenCalledWith(
      { id: 1 },
      {
        models: 'selected-model-next#新版本',
        textModels: null,
        visionModels: 'vision-model',
        imageGenerationModels: null,
        videoGenerationModels: null,
        embeddingModels: null,
      },
    );
    expect(provider.name).toBe('当前账号');
    expect(provider.secretKey).toBe('Bearer saved-key');
    expect(featureRepository.update).not.toHaveBeenCalled();
    await service.removeRetiredModel(request);
    expect(store.update).toHaveBeenCalledTimes(1);
  });

  it.each(['url', 'key', 'disabled', 'deleted'])(
    '账号 %s 已改变则不应用旧请求的清理',
    async (changed) => {
      const { service, provider, store, request } = providerHarness();
      if (changed === 'url')
        provider.apiUrl = 'https://dashscope.aliyuncs.com/v1';
      if (changed === 'key') provider.secretKey = 'new-key';
      if (changed === 'disabled') provider.isEnabled = false;
      if (changed === 'deleted') store.findOne.mockResolvedValue(null);
      await expect(service.removeRetiredModel(request)).resolves.toBe(false);
      expect(store.update).not.toHaveBeenCalled();
    },
  );

  it('自定义域名不进入持久化事务', async () => {
    const { service, repository, request } = providerHarness();
    await expect(
      service.removeRetiredModel({
        ...request,
        url: 'https://proxy.example/v1',
      }),
    ).resolves.toBe(false);
    expect(repository.manager.transaction).not.toHaveBeenCalled();
  });

  it('最后一个模型移除后空目录不补默认，更新账号也保留显式空值', async () => {
    const { service, provider, request, repository } = providerHarness();
    provider.models = model;
    await service.removeRetiredModel(request);
    await expect(
      service.assertModelSupported({
        id: 1,
        model: 'qwen-plus',
        featureType: 'chat',
      }),
    ).rejects.toThrow('所选模型不在');
    await expect(service.resolveChatTarget({ id: 1 })).rejects.toThrow(
      '账号未配置可用模型',
    );
    await expect(
      service.resolveChatTarget({ id: 1, model: 'qwen-plus' }),
    ).rejects.toThrow('账号未配置可用模型');
    await service.update(1, { models: '' });
    expect(repository.update).toHaveBeenCalledWith({ id: 1 }, { models: '' });
  });

  it('改账号名称的旧查询快照不能覆盖随后完成的退役清理', async () => {
    const { service, provider, request, repository } = providerHarness();
    repository.findOne.mockImplementationOnce(async () => {
      const stale = Object.assign(new KnowledgeAiProvider(), provider);
      await service.removeRetiredModel(request);
      return stale;
    });
    const updated = await service.update(1, { name: '修改后的账号名' });
    expect(repository.update).toHaveBeenCalledWith(
      { id: 1 },
      { name: '修改后的账号名' },
    );
    expect(repository.save).not.toHaveBeenCalled();
    expect(updated.name).toBe('修改后的账号名');
    expect(updated.models).toBe('selected-model-next#新版本');
    expect(updated.textModels).toBe('');
    expect(provider.models).toBe('selected-model-next#新版本');
  });

  it('人工明确提交模型目录仍可重新登记模型', async () => {
    const { service, provider, request, repository } = providerHarness();
    await service.removeRetiredModel(request);
    const updated = await service.update(1, { models: model });
    expect(repository.update).toHaveBeenCalledWith(
      { id: 1 },
      { models: model },
    );
    expect(updated.models).toBe(model);
    expect(provider.models).toBe(model);
  });

  it.each(['feature', 'card'] as const)(
    '%s 真实错误清理成功并通过幂等记录返回结果',
    async (origin) => {
      const { service, providers, feature, card } = runnerHarness();
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          json(
            { error: { message_zh: '所选模型已下线，请选择新模型。' } },
            400,
          ),
        );
      const start = () =>
        origin === 'feature'
          ? service.startFeature(feature, 7)
          : service.start(3, card, 7);
      const result = await start();
      expect(result).toMatchObject({
        status: 'failed',
        modelRemoved: true,
        providerId: 1,
        model,
      });
      expect(result.message).toContain('已从当前账号模型目录移除');
      await start();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(providers.removeRetiredModel).toHaveBeenCalledTimes(1);
      expect(providers.removeRetiredModel).toHaveBeenCalledWith({
        providerId: 1,
        model,
        url: officialUrl,
        secretKey: 'saved-key',
      });
    },
  );

  it.each(['failed', 'changed'])(
    '清理 %s 时仍返回明确下线，但不谎报已移除',
    async (kind) => {
      const { service, providers, feature } = runnerHarness();
      if (kind === 'failed')
        providers.removeRetiredModel.mockRejectedValue(
          new Error('database unavailable'),
        );
      else providers.removeRetiredModel.mockResolvedValue(false);
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          json({ error: { message: 'The model has been retired.' } }, 400),
        );
      const result = await service.startFeature(feature, 7);
      expect(result).toMatchObject({
        status: 'failed',
        modelRemoved: false,
      });
      expect(result.message).toContain('账号目录尚未更新');
    },
  );

  it('自定义平台的相同错误文案不清理目录', async () => {
    const { service, providers, target, feature } = runnerHarness();
    target.url = 'https://proxy.example/generate';
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        json({ error: { message: 'The model has been retired.' } }, 400),
      );
    await service.startFeature(feature, 7);
    expect(providers.removeRetiredModel).not.toHaveBeenCalled();
  });

  it.each([
    { choices: [{ message: { content: 'The model has been retired.' } }] },
    { message: 'The model has been retired.' },
    {
      error: {
        input: 'The model has been retired.',
        message: 'Invalid prompt',
      },
    },
    { error: { code: 410001, message: 'The model has been retired.' } },
    { error: { code: 'ModelNotFound', message: 'Model does not exist' } },
    { error: { message: 'The model will be retired tomorrow.' } },
    { error: { message: 'Model other-model has been retired.' } },
    { error: { message: 'The model is temporarily offline.' } },
    {
      error: {
        message:
          'No free trial quota is available for the service and postpaid billing is not enabled',
      },
    },
    {
      error: {
        message:
          'Access to model denied. Please make sure you are eligible for using the model',
      },
    },
  ])('不从正常回答、非退役或不确定响应移除目录：%j', async (body) => {
    const { service, providers, feature } = runnerHarness();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(json(body));
    const result = await service.startFeature(feature, 7);
    expect(result.modelRemoved).not.toBe(true);
    expect(providers.removeRetiredModel).not.toHaveBeenCalled();
  });

  it('查询原异步任务失败不清理目录且保留任务编号', async () => {
    const { service, providers, target, feature } = runnerHarness();
    Object.assign(target, {
      functionType: 'textToImage',
      protocol: 'tokenhubViduImage',
      executionMode: 'async',
      taskUrlTemplate: 'https://tokenhub.tencentmaas.com/tasks/{taskId}',
    });
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ state: 'created', task_id: 'task-1' }))
      .mockResolvedValueOnce(
        json({ error: { message: 'The model has been retired.' } }, 400),
      );
    await expect(
      service.startFeature({ ...feature, featureType: 'imageGeneration' }, 7),
    ).resolves.toMatchObject({ status: 'accepted', taskId: 'task-1' });
    await expect(
      service.queryFeature(feature.requestId, 7),
    ).resolves.toMatchObject({
      status: 'unknown',
      taskId: 'task-1',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(providers.removeRetiredModel).not.toHaveBeenCalled();
  });
});
