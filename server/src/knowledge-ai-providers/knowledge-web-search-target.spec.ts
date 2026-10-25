import { BadRequestException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { KnowledgeAiProvidersService } from './knowledge-ai-providers.service';
import { KnowledgeAiProvider } from './entities/knowledge-ai-provider.entity';
import type { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import type { LogRecordsService } from '../log-records/log-records.service';
import type { ModelEndpointsService } from '../model-endpoints/model-endpoints.service';
import { builtinModelEndpoint } from '../model-endpoints/model-endpoint.builtins';
import type {
  ModelFunction,
  PlatformType,
} from '../model-endpoints/model-endpoint.constants';

function harness() {
  const provider = Object.assign(new KnowledgeAiProvider(), {
    id: 2,
    name: '腾讯账号',
    apiUrl: 'https://tokenhub.tencentmaas.com/v1',
    isEnabled: true,
    secretKey: 'Bearer hidden-key',
    models:
      'hy3\ndeepseek-v4-flash\ndeepseek-v4-pro\ndeepseek-v4-flash-0731\ndeepseek-v4-pro-0813\ndeepseek-v4-flash-202605\nglm-5.3\nqwen-plus',
    textModels: '',
    visionModels: 'vision-only-model',
  });
  const repository = { findOne: jest.fn().mockResolvedValue(provider) };
  const cards = new Map<string, Record<string, unknown>>();
  for (const model of [
    'hy3',
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'deepseek-v4-flash-0731',
    'deepseek-v4-pro-0813',
  ])
    cards.set(model, {
      id: 11,
      modelCode: model,
      functionType: 'webSearch',
      source: 'configured',
      protocol: model === 'hy3' ? 'openaiResponses' : 'openaiChatSearch',
      apiPath: model === 'hy3' ? '/v1/responses' : '/v1/chat/completions',
      executionMode: 'sync',
      isActive: true,
    });
  const endpoints = {
    resolve: jest.fn(
      (platform: PlatformType, model: string, functionType: ModelFunction) => {
        if (functionType === 'webSearch') {
          const card =
            cards.get(`${platform}:${model}`) ??
            (platform === 'tencentTokenhub' ? cards.get(model) : undefined);
          if (card?.isActive === false)
            throw new BadRequestException('当前模型功能的调用接口已停用');
          return Promise.resolve(
            card ?? builtinModelEndpoint(platform, functionType, model),
          );
        }
        return Promise.resolve({
          source: 'builtin',
          modelName: '系统普通调用',
          functionType: 'chat',
          protocol: 'openaiChat',
          executionMode: 'sync',
          apiPath: '/compatible-mode/v1/chat/completions',
        });
      },
    ),
    buildUrl: (base: string, path: string) => new URL(base).origin + path,
  };
  const service = new KnowledgeAiProvidersService(
    repository as unknown as Repository<KnowledgeAiProvider>,
    {} as Repository<AiFeatureConfig>,
    {} as LogRecordsService,
    endpoints as unknown as ModelEndpointsService,
  );
  return { provider, cards, endpoints, service };
}

describe('业务原生搜索目标共用厂商联网卡片解析', () => {
  it.each([
    ['hy3', 'openaiResponses', '/v1/responses'],
    ['deepseek-v4-flash', 'openaiChatSearch', '/v1/chat/completions'],
    ['deepseek-v4-pro', 'openaiChatSearch', '/v1/chat/completions'],
    ['deepseek-v4-flash-0731', 'openaiChatSearch', '/v1/chat/completions'],
    ['deepseek-v4-pro-0813', 'openaiChatSearch', '/v1/chat/completions'],
  ])(
    '按 %s 的精确卡片选择协议，不把腾讯全部强制为 Responses',
    async (model, protocol, path) => {
      const { service, endpoints } = harness();
      const fetchSpy = jest.spyOn(globalThis, 'fetch');
      try {
        await expect(
          service.resolveWebSearchTarget({
            id: 2,
            model,
            webSearchMode: 'tokenhubSearch',
          }),
        ).resolves.toMatchObject({
          model,
          protocol,
          url: `https://tokenhub.tencentmaas.com${path}`,
          functionType: 'webSearch',
          secretKey: 'hidden-key',
          taskUrlTemplate: null,
          source: 'configured',
        });
        expect(endpoints.resolve).toHaveBeenCalledWith(
          'tencentTokenhub',
          model,
          'webSearch',
        );
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
      }
    },
  );
  it.each(['glm-5.3', 'deepseek-v4-flash-202605'])(
    '目录中的 %s 使用默认格式尝试，具体编码原样保留且配置检查不发付费调用',
    async (model) => {
      const { service, endpoints } = harness();
      await expect(
        service.resolveWebSearchTarget({
          id: 2,
          model,
          webSearchMode: 'tokenhubSearch',
        }),
      ).resolves.toMatchObject({
        model,
        protocol: 'openaiResponses',
        url: 'https://tokenhub.tencentmaas.com/v1/responses',
        source: 'builtin',
        ruleName: '腾讯 TokenHub · 联网搜索 Responses（系统通用）',
      });
      expect(endpoints.resolve).toHaveBeenCalledWith(
        'tencentTokenhub',
        model,
        'webSearch',
      );
      expect(endpoints.resolve).toHaveBeenCalledTimes(1);
    },
  );
  it('停用、错误协议和异步配置均不能回退到普通 Chat', async () => {
    const { service, cards } = harness();
    const card = cards.get('hy3')!;
    card.isActive = false;
    await expect(
      service.resolveWebSearchTarget({
        id: 2,
        model: 'hy3',
        webSearchMode: 'tokenhubSearch',
      }),
    ).rejects.toThrow('已停用');
    card.isActive = true;
    card.protocol = 'openaiChat';
    await expect(
      service.resolveWebSearchTarget({
        id: 2,
        model: 'hy3',
        webSearchMode: 'tokenhubSearch',
      }),
    ).rejects.toThrow('协议配置');
    card.protocol = 'openaiResponses';
    card.executionMode = 'async';
    await expect(
      service.resolveWebSearchTarget({
        id: 2,
        model: 'hy3',
        webSearchMode: 'tokenhubSearch',
      }),
    ).rejects.toThrow('协议配置');
  });
  it.each([
    'http://tokenhub.tencentmaas.com/v1',
    'https://tokenhub.tencentmaas.com:8443/v1',
    'https://tokenhub.tencentmaas.com.evil.example/v1',
  ])('拒绝非官方标准安全地址 %s', async (url) => {
    const { service, provider } = harness();
    provider.apiUrl = url;
    await expect(
      service.resolveWebSearchTarget({
        id: 2,
        model: 'hy3',
        webSearchMode: 'tokenhubSearch',
      }),
    ).rejects.toThrow();
  });
  it('官方国际站按已保存路径解析，账号功能目录和凭据仍须有效', async () => {
    const { service, provider } = harness();
    provider.apiUrl = 'https://tokenhub-intl.tencentmaas.com/v1';
    await expect(
      service.resolveWebSearchTarget({
        id: 2,
        model: 'hy3',
        webSearchMode: 'tokenhubSearch',
      }),
    ).resolves.toMatchObject({
      url: 'https://tokenhub-intl.tencentmaas.com/v1/responses',
    });
    await expect(
      service.resolveWebSearchTarget({
        id: 2,
        model: 'vision-only-model',
        webSearchMode: 'tokenhubSearch',
      }),
    ).rejects.toThrow('普通文本模型目录');
    provider.secretKey = '  ';
    await expect(
      service.resolveWebSearchTarget({
        id: 2,
        model: 'hy3',
        webSearchMode: 'tokenhubSearch',
      }),
    ).rejects.toThrow('未配置密钥');
  });
  it('联网方式不能跨平台使用，百炼继续使用原官方 Responses 地址规则', async () => {
    const { service, provider } = harness();
    await expect(
      service.resolveWebSearchTarget({
        id: 2,
        model: 'hy3',
        webSearchMode: 'bailianResponses',
      }),
    ).rejects.toThrow('不适用于');
    provider.apiUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    await expect(
      service.resolveWebSearchTarget({
        id: 2,
        model: 'qwen-plus',
        webSearchMode: 'tokenhubSearch',
      }),
    ).rejects.toThrow('不适用于');
    await expect(
      service.resolveWebSearchTarget({
        id: 2,
        model: 'qwen-plus',
        webSearchMode: 'bailianResponses',
      }),
    ).resolves.toMatchObject({
      protocol: 'openaiResponses',
      url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/responses',
      source: 'builtin',
    });
  });

  it('百炼专用联网卡片优先，停用或错误协议不得回退通用格式', async () => {
    const { service, provider, cards } = harness();
    provider.apiUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    const card = {
      id: 17,
      functionType: 'webSearch',
      protocol: 'openaiResponses',
      source: 'configured',
      executionMode: 'sync',
      isActive: true,
      apiPath: '/compatible-mode/v1/responses',
    };
    cards.set('aliyunBailian:qwen-plus', card);
    const input = {
      id: 2,
      model: 'qwen-plus',
      webSearchMode: 'bailianResponses' as const,
    };
    await expect(service.resolveWebSearchTarget(input)).resolves.toMatchObject({
      source: 'configured',
      ruleName: '模型专用 · qwen-plus（联网搜索）',
    });
    card.isActive = false;
    await expect(service.resolveWebSearchTarget(input)).rejects.toThrow(
      '已停用',
    );
    card.isActive = true;
    card.protocol = 'openaiChatSearch';
    await expect(service.resolveWebSearchTarget(input)).rejects.toThrow(
      '协议配置',
    );
    card.protocol = 'openaiResponses';
    card.apiPath = '/vendor/responses';
    await expect(service.resolveWebSearchTarget(input)).rejects.toThrow(
      '官方 Responses',
    );
  });

  it.each([
    'https://coding.dashscope.aliyuncs.com/v1',
    'https://dashscope.aliyuncs.com:8443/compatible-mode/v1',
    'http://dashscope.aliyuncs.com/compatible-mode/v1',
  ])('百炼联网拒绝未接入的专用域名或不安全地址 %s', async (apiUrl) => {
    const { service, provider } = harness();
    provider.apiUrl = apiUrl;
    await expect(
      service.resolveWebSearchTarget({
        id: 2,
        model: 'qwen-plus',
        webSearchMode: 'bailianResponses',
      }),
    ).rejects.toThrow();
  });
});
