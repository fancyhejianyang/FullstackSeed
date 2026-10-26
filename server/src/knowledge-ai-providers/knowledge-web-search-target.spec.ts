import type { Repository } from 'typeorm';
import { KnowledgeAiProvidersService } from './knowledge-ai-providers.service';
import { KnowledgeAiProvider } from './entities/knowledge-ai-provider.entity';
import type { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import type { LogRecordsService } from '../log-records/log-records.service';
import type { ModelEndpointsService } from '../model-endpoints/model-endpoints.service';

function harness() {
  const provider = Object.assign(new KnowledgeAiProvider(), {
    id: 2,
    name: '平台账号',
    apiUrl: 'https://tokenhub.tencentmaas.com/v1',
    isEnabled: true,
    secretKey: 'Bearer hidden-key',
    workspaceId: null,
    models:
      'hy3\ndeepseek-v4-flash\ndeepseek-v4-pro\ndeepseek-v4-flash-0731\ndeepseek-v4-pro-0813\nglm-5.3\nqwen-plus',
    textModels: '',
    visionModels: 'vision-only-model',
  });
  const endpoints = {
    resolve: jest
      .fn()
      .mockRejectedValue(new Error('retired card must never be read')),
  };
  const service = new KnowledgeAiProvidersService(
    {
      findOne: jest.fn().mockResolvedValue(provider),
    } as unknown as Repository<KnowledgeAiProvider>,
    {} as Repository<AiFeatureConfig>,
    {} as LogRecordsService,
    endpoints as unknown as ModelEndpointsService,
  );
  return { provider, endpoints, service };
}

describe('系统内部自动联网目标不再依赖厂商卡片', () => {
  it.each([
    ['hy3', 'openaiResponses', '/v1/responses'],
    ['glm-5.3', 'openaiResponses', '/v1/responses'],
    ['deepseek-v4-flash', 'openaiChatSearch', '/v1/chat/completions'],
    ['deepseek-v4-pro', 'openaiChatSearch', '/v1/chat/completions'],
    ['deepseek-v4-flash-0731', 'openaiChatSearch', '/v1/chat/completions'],
    ['deepseek-v4-pro-0813', 'openaiChatSearch', '/v1/chat/completions'],
  ])(
    '自动解析 %s，只提供请求格式不冒充搜索已成功',
    async (model, protocol, pathname) => {
      const { service, endpoints } = harness();
      await expect(
        service.resolveWebSearchTarget({ id: 2, model }),
      ).resolves.toMatchObject({
        model,
        protocol,
        webSearchMode: 'tokenhubSearch',
        url: 'https://tokenhub.tencentmaas.com' + pathname,
        secretKey: 'hidden-key',
        source: 'builtin',
      });
      expect(endpoints.resolve).not.toHaveBeenCalled();
    },
  );
  it.each(['disabled', 'bailianChat', 'bailianResponses'] as const)(
    '旧手动选择 %s 不控制当前腾讯自动策略',
    async (webSearchMode) => {
      const { service } = harness();
      await expect(
        service.resolveWebSearchTarget({ id: 2, model: 'hy3', webSearchMode }),
      ).resolves.toMatchObject({
        webSearchMode: 'tokenhubSearch',
        protocol: 'openaiResponses',
      });
    },
  );
  it.each([
    'https://dashscope.aliyuncs.com/compatible-mode/v1',
    'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
  ])('百炼 %s 保留独立 Responses 路径', async (apiUrl) => {
    const { service, provider, endpoints } = harness();
    provider.apiUrl = apiUrl;
    await expect(
      service.resolveWebSearchTarget({ id: 2, model: 'qwen-plus' }),
    ).resolves.toMatchObject({
      protocol: 'openaiResponses',
      webSearchMode: 'bailianResponses',
      url: new URL(apiUrl).origin + '/compatible-mode/v1/responses',
    });
    expect(endpoints.resolve).not.toHaveBeenCalled();
  });
  it.each([
    'https://proxy.example.com/v1',
    'https://tokenhub.tencentmaas.com.evil.example/v1',
    'http://tokenhub.tencentmaas.com/v1',
    'https://tokenhub.tencentmaas.com:8443/v1',
    'https://tokenhub.tencentmaas.com/v1?token=private',
    'https://tokenhub.tencentmaas.com/v1#fragment',
    'https://coding.dashscope.aliyuncs.com/v1',
  ])('拒绝不支持或不安全的自动联网地址 %s', async (apiUrl) => {
    const { service, provider } = harness();
    provider.apiUrl = apiUrl;
    await expect(
      service.resolveWebSearchTarget({ id: 2, model: 'hy3' }),
    ).rejects.toThrow();
  });
  it('账号目录、密钥及启用状态仍需有效', async () => {
    const { service, provider } = harness();
    await expect(
      service.resolveWebSearchTarget({ id: 2, model: 'vision-only-model' }),
    ).rejects.toThrow('普通文本模型目录');
    provider.secretKey = ' ';
    await expect(
      service.resolveWebSearchTarget({ id: 2, model: 'hy3' }),
    ).rejects.toThrow('密钥');
    provider.secretKey = 'hidden-key';
    provider.isEnabled = false;
    await expect(
      service.resolveWebSearchTarget({ id: 2, model: 'hy3' }),
    ).rejects.toThrow('未启用');
  });
});
