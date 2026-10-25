import {
  KnowledgeWebSearchService,
  bailianResponsesUrl,
  parseVerifiedSearchResponse,
} from './knowledge-web-search.service';
import type { KnowledgeAiProvidersService } from './knowledge-ai-providers.service';
import type { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';

const config = {
  isEnabled: true,
  featureType: 'topicDiscovery',
  providerId: 1,
  model: 'qwen3.8-max',
  webSearchMode: 'bailianResponses',
  enableThinking: false,
} as AiFeatureConfig;
const verified = () => ({
  status: 'completed',
  output: [
    {
      type: 'web_search_call',
      status: 'completed',
      action: {
        sources: [
          { url: 'https://www.douyin.com/video/123', title: '真实来源标题' },
        ],
      },
    },
    {
      type: 'message',
      content: [
        {
          type: 'output_text',
          text: JSON.stringify({
            items: [
              {
                title: '真实标题',
                url: 'https://www.douyin.com/video/123',
                summary: '来源摘要',
                publishedAt: '2026-10-21',
                rank: 1,
              },
              {
                title: '模型编造',
                url: 'https://www.douyin.com/video/999',
                summary: '没有搜索来源',
              },
            ],
          }),
        },
      ],
    },
  ],
  usage: { input_tokens: 10, output_tokens: 20 },
});

describe('verified Bailian web search', () => {
  it('derives Responses only for strict official endpoint paths', () => {
    expect(
      bailianResponsesUrl(
        'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions',
      ),
    ).toBe(
      'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/responses',
    );
    expect(
      bailianResponsesUrl(
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      ),
    ).toContain('/responses');
    for (const url of [
      'https://proxy.example.com/compatible-mode/v1/chat/completions',
      'https://dashscope.aliyuncs.com.attacker.com/compatible-mode/v1/chat/completions',
      'http://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      'https://dashscope.aliyuncs.com/anything/chat/completions',
    ])
      expect(() => bailianResponsesUrl(url)).toThrow('仅支持');
  });
  it('only admits real tool source URLs and never AI-inferred dates', () => {
    const result = parseVerifiedSearchResponse(verified());
    expect(result.sources).toEqual([
      {
        title: '真实来源标题',
        url: 'https://www.douyin.com/video/123',
        summary: '来源摘要',
        publishedAt: null,
      },
    ]);
    expect(result.searchExecuted).toBe(true);
    expect(result.totalTokens).toBe(30);
  });
  it('requires completed execution and real tool sources, not prose citations or usage alone', () => {
    expect(() =>
      parseVerifiedSearchResponse({ ...verified(), status: 'incomplete' }),
    ).toThrow('未正常完成');
    expect(() =>
      parseVerifiedSearchResponse({
        status: 'completed',
        output: [verified().output[1]],
        usage: { x_tools: { web_search: { count: 1 } } },
      }),
    ).toThrow('可核验');
    expect(() =>
      parseVerifiedSearchResponse({
        status: 'completed',
        output: [
          {
            type: 'web_search_call',
            status: 'failed',
            action: {
              sources: [{ url: 'https://example.com', title: 'failed' }],
            },
          },
        ],
      }),
    ).toThrow('可核验');
  });
  it('blocks unsupported Chat mode before a paid call', async () => {
    const resolveWebSearchTarget = jest.fn();
    const fetchMock = jest.spyOn(global, 'fetch');
    const service = new KnowledgeWebSearchService({
      resolveWebSearchTarget,
    } as unknown as KnowledgeAiProvidersService);
    try {
      await expect(
        service.search(
          { ...config, webSearchMode: 'bailianChat' },
          '热点',
          new AbortController().signal,
        ),
      ).rejects.toThrow('未调用计费接口');
      expect(resolveWebSearchTarget).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });
  it('sends only web_search tool and fixed core fields with official credentials', async () => {
    const resolveWebSearchTarget = jest.fn().mockResolvedValue({
      model: 'qwen3.8-max',
      url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/responses',
      protocol: 'openaiResponses',
      secretKey: 'fixture-key',
    });
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(verified()), { status: 200 }),
      );
    const service = new KnowledgeWebSearchService({
      resolveWebSearchTarget,
    } as unknown as KnowledgeAiProvidersService);
    try {
      await service.search(config, '热点', new AbortController().signal);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'https://dashscope.aliyuncs.com/compatible-mode/v1/responses',
      );
      const body = JSON.parse(
        typeof init?.body === 'string' ? init.body : '{}',
      ) as Record<string, unknown>;
      expect(body.tools).toEqual([{ type: 'web_search' }]);
      expect(body.enable_thinking).toBe(false);
      expect(init?.redirect).toBe('error');
    } finally {
      fetchMock.mockRestore();
    }
  });
});
