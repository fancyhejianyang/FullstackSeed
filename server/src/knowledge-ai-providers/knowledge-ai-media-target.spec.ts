import type { Repository } from 'typeorm';
import { KnowledgeAiProvidersService } from './knowledge-ai-providers.service';
import { KnowledgeAiProvider } from './entities/knowledge-ai-provider.entity';
import type { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import type { LogRecordsService } from '../log-records/log-records.service';
import { ModelEndpointsService } from '../model-endpoints/model-endpoints.service';
import type { ModelEndpoint } from '../model-endpoints/entities/model-endpoint.entity';
import type { ModelFunction } from '../model-endpoints/model-endpoint.constants';

describe('Agent media targets', () => {
  function harness() {
    const provider: KnowledgeAiProvider = Object.assign(
      new KnowledgeAiProvider(),
      {
        id: 2,
        name: 'media',
        isEnabled: true,
        secretKey: 'secret',
        apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        models: 'text-only',
        textModels: 'text-only',
        visionModels: 'vision#视觉',
        imageGenerationModels: 'image#生图',
        imageGenerationProtocol: 'dashscope',
        imageGenerationApiUrl:
          'https://old.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
        videoGenerationModels: 'wan#视频',
        videoGenerationApiUrl:
          'https://old.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
        workspaceId: 'workspace',
      },
    );
    const repository = { findOne: jest.fn().mockResolvedValue(provider) };
    const imageEndpoint = {
      protocol: 'dashscopeImage',
      executionMode: 'sync',
      apiPath: '/api/v1/services/aigc/multimodal-generation/generation',
      taskApiPath: '',
    };
    const videoEndpoint = {
      protocol: 'dashscopeVideo',
      executionMode: 'async',
      apiPath: '/api/v1/services/aigc/video-generation/video-synthesis',
      taskApiPath: '/api/v1/tasks/{taskId}',
    };
    const builder = new ModelEndpointsService({} as Repository<ModelEndpoint>);
    const endpoints = {
      resolve: jest.fn(
        (_platform: string, model: string, functionType: ModelFunction) =>
          Promise.resolve(
            model === 'image' && functionType === 'textToImage'
              ? imageEndpoint
              : model === 'wan' && functionType === 'textToVideo'
                ? videoEndpoint
                : null,
          ),
      ),
      imageRoutes: jest.fn().mockResolvedValue([]),
      buildUrl: (base: string, path: string) => builder.buildUrl(base, path),
    };
    const service = new KnowledgeAiProvidersService(
      repository as unknown as Repository<KnowledgeAiProvider>,
      {} as Repository<AiFeatureConfig>,
      {} as LogRecordsService,
      endpoints as unknown as ModelEndpointsService,
    );
    return { provider, service, endpoints, imageEndpoint };
  }

  it('uses the model function card and account origin, ignoring legacy account endpoints', async () => {
    const { service } = harness();
    await expect(
      service.resolveAgentMediaTarget(2, 'image', 'imageGeneration'),
    ).resolves.toMatchObject({
      model: 'image',
      protocol: 'dashscope',
      url: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    });
    await expect(
      service.resolveAgentMediaTarget(2, 'vision', 'vision'),
    ).resolves.toMatchObject({
      model: 'vision',
      url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    });
    await expect(
      service.resolveAgentMediaTarget(2, 'text-only', 'vision'),
    ).rejects.toThrow('不在');
    await expect(
      service.resolveAgentMediaTarget(2, 'vision', 'imageGeneration'),
    ).rejects.toThrow('不在');
  });

  it('视频生成使用独立目录、异步提交地址和同域任务查询模板', async () => {
    const { service } = harness();
    await expect(
      service.resolveMediaTarget(2, 'wan', 'videoGeneration'),
    ).resolves.toMatchObject({
      model: 'wan',
      protocol: 'dashscope',
      url: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
      taskUrlTemplate: 'https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}',
    });
  });
  it('历史视频地址不再影响实际调用路径', async () => {
    const { service, provider } = harness();
    provider.videoGenerationApiUrl =
      'https://old.cn-beijing.maas.aliyuncs.com/api/v1/services/aigcvideo-generation/video-synthesis';
    await expect(
      service.resolveMediaTarget(2, 'wan', 'videoGeneration'),
    ).resolves.toMatchObject({
      url: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
      taskUrlTemplate: 'https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}',
    });
  });
  it('缺少卡片时即使旧账号填写过地址也明确拒绝', async () => {
    const { service, endpoints } = harness();
    endpoints.resolve.mockResolvedValue(null);
    await expect(
      service.resolveMediaTarget(2, 'wan', 'videoGeneration'),
    ).rejects.toThrow('文生视频');
    await expect(
      service.resolveMediaTarget(2, 'image', 'imageGeneration'),
    ).rejects.toThrow('文生图');
    await expect(
      service.resolveMediaTarget(2, 'image', 'imageGeneration', 'imageToImage'),
    ).rejects.toThrow('参考生图');
  });
  it('内容封面直接选同账号首个有效生图模型，缺配置跳过且不调用 Agent 入口', async () => {
    const { service, provider, endpoints, imageEndpoint } = harness();
    endpoints.resolve.mockResolvedValue(imageEndpoint);
    const agent = jest.spyOn(service, 'resolveAgentMediaTarget');
    provider.imageGenerationModels = '\n#无编码\nfirst#首选\nsecond#备用';
    await expect(service.resolveContentCoverTarget(2)).resolves.toMatchObject({
      providerId: 2,
      model: 'first',
      protocol: 'dashscope',
    });
    expect(agent).not.toHaveBeenCalled();
    provider.imageGenerationModels = null;
    await expect(service.resolveContentCoverTarget(2)).resolves.toBeNull();
    provider.imageGenerationModels = '#无编码';
    await expect(service.resolveContentCoverTarget(2)).resolves.toBeNull();
    provider.imageGenerationModels = 'image';
    endpoints.resolve.mockResolvedValue(null);
    await expect(service.resolveContentCoverTarget(2)).resolves.toBeNull();
  });

  it('rejects missing catalog, disabled account and missing key; legacy URLs are never used', async () => {
    const { service, provider } = harness();
    provider.visionModels = null;
    await expect(
      service.resolveAgentMediaTarget(2, 'text-only', 'vision'),
    ).rejects.toThrow('目录');
    provider.visionModels = '#仅有显示名称';
    await expect(
      service.resolveAgentMediaTarget(2, 'text-only', 'vision'),
    ).rejects.toThrow('不在');
    provider.isEnabled = false;
    await expect(
      service.resolveAgentMediaTarget(2, 'image', 'imageGeneration'),
    ).rejects.toThrow('未启用');
    provider.isEnabled = true;
    provider.secretKey = null;
    await expect(
      service.resolveAgentMediaTarget(2, 'image', 'imageGeneration'),
    ).rejects.toThrow('密钥');
    provider.secretKey = 'secret';
    for (const url of [
      '',
      'http://provider.example/images',
      'https://user:password@provider.example/images',
      'https://provider.example/images?api_key=secret',
    ]) {
      provider.imageGenerationApiUrl = url;
      await expect(
        service.resolveAgentMediaTarget(2, 'image', 'imageGeneration'),
      ).resolves.toMatchObject({
        url: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      });
    }
  });
});
