import type { Repository } from 'typeorm';
import { KnowledgeAiProvidersService } from './knowledge-ai-providers.service';
import { KnowledgeAiProvider } from './entities/knowledge-ai-provider.entity';
import type { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import type { LogRecordsService } from '../log-records/log-records.service';

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
        workspaceId: 'workspace',
      },
    );
    const repository = { findOne: jest.fn().mockResolvedValue(provider) };
    const service = new KnowledgeAiProvidersService(
      repository as unknown as Repository<KnowledgeAiProvider>,
      {} as Repository<AiFeatureConfig>,
      {} as LogRecordsService,
    );
    return { provider, service };
  }

  it('uses the configured media catalog, protocol and full endpoint, not the chat path', async () => {
    const { service } = harness();
    await expect(
      service.resolveAgentMediaTarget(2, 'image', 'imageGeneration'),
    ).resolves.toMatchObject({
      model: 'image',
      protocol: 'dashscope',
      url: 'https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
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
  it('内容封面直接选同账号首个有效生图模型，缺配置跳过且不调用 Agent 入口', async () => {
    const { service, provider } = harness();
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
    provider.imageGenerationApiUrl = '';
    await expect(service.resolveContentCoverTarget(2)).resolves.toBeNull();
  });

  it('rejects missing catalog, disabled account, missing key and unsafe generation endpoints', async () => {
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
      ).rejects.toThrow();
    }
  });
});
