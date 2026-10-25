import type { Repository } from 'typeorm';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import { KnowledgeAiProvider } from '../knowledge-ai-providers/entities/knowledge-ai-provider.entity';
import type { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import type { LogRecordsService } from '../log-records/log-records.service';
import type { ModelEndpointsService } from './model-endpoints.service';

function harness() {
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
    findAndCount: jest.fn().mockResolvedValue([[provider], 1]),
  };
  const endpoints = {
    resolve: jest.fn().mockResolvedValue(null),
    imageRoutes: jest.fn().mockResolvedValue([]),
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
  it('账号列表和详情由后端识别平台，不返回真实密钥', async () => {
    const { service } = harness();
    const view = await service.findOne(1);
    expect(view.platformType).toBe('tencentTokenhub');
    expect(view).not.toHaveProperty('secretKey');
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
});
