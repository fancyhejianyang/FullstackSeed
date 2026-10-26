import {
  KnowledgeWebSearchService,
  bailianResponsesUrl,
  parseVerifiedSearchResponse,
} from './knowledge-web-search.service';
import type { KnowledgeAiProvidersService } from './knowledge-ai-providers.service';
import type { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import type { HotSearchDiagnostics } from './knowledge-web-search-diagnostics';

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
  it('系统自动联网忽略历史手动标记，协议由解析后的账号目标决定', async () => {
    const resolveWebSearchTarget = jest.fn().mockResolvedValue({
      model: config.model,
      webSearchMode: 'bailianResponses',
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
      await expect(
        service.search(
          { ...config, webSearchMode: 'bailianChat' },
          '热点',
          new AbortController().signal,
        ),
      ).resolves.toMatchObject({ searchExecuted: true });
      expect(resolveWebSearchTarget).toHaveBeenCalledWith({
        id: config.providerId,
        model: config.model,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
    }
  });
  it('sends only web_search tool and fixed core fields with official credentials', async () => {
    const resolveWebSearchTarget = jest.fn().mockResolvedValue({
      model: 'qwen3.8-max',
      webSearchMode: 'bailianResponses',
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

describe.each([
  {
    platform: '百炼',
    model: 'qwen3.8-max',
    webSearchMode: 'bailianResponses',
    protocol: 'openaiResponses',
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/responses',
    secretKey: 'fixture-bailian-key',
  },
  {
    platform: '腾讯',
    model: 'hy3',
    webSearchMode: 'tokenhubSearch',
    protocol: 'openaiResponses',
    url: 'https://tokenhub.tencentmaas.com/v1/responses',
    secretKey: 'fixture-tokenhub-key',
  },
] as const)('$platform 联网响应读取的取消优先级', (target) => {
  afterEach(() => jest.restoreAllMocks());

  function responseWithReader(
    status: number,
    read: () => Promise<ReadableStreamReadResult<Uint8Array<ArrayBuffer>>>,
  ) {
    const response = new Response('fixture response', { status });
    if (!response.body) throw new Error('测试响应缺少 body');
    const reader = response.body.getReader();
    jest.spyOn(reader, 'read').mockImplementation(read);
    jest.spyOn(response.body, 'getReader').mockReturnValue(reader);
    return response;
  }

  function harness(response: Response) {
    const resolveWebSearchTarget = jest.fn().mockResolvedValue(target);
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response);
    const service = new KnowledgeWebSearchService({
      resolveWebSearchTarget,
    } as unknown as KnowledgeAiProvidersService);
    const diagnostics: HotSearchDiagnostics[] = [];
    const run = (signal = new AbortController().signal) =>
      service.search(
        { ...config, model: target.model },
        '热点',
        signal,
        (value) => diagnostics.push(value),
      );
    return { run, fetchSpy, diagnostics };
  }

  it.each([
    [401, 'AbortError'],
    [401, 'TimeoutError'],
    [500, 'AbortError'],
    [500, 'TimeoutError'],
  ] as const)(
    'HTTP %s 错误体读取时保留 %s，不覆盖为 HTTP 或计费错误',
    async (status, errorName) => {
      const caller = new AbortController();
      const timeout = new AbortController();
      if (errorName === 'TimeoutError')
        jest.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
      const reason = new DOMException('响应读取已取消或超时', errorName);
      const response = responseWithReader(status, () => {
        (errorName === 'TimeoutError' ? timeout : caller).abort(reason);
        return Promise.reject(reason);
      });
      const h = harness(response);

      await expect(h.run(caller.signal)).rejects.toBe(reason);
      expect(h.fetchSpy).toHaveBeenCalledTimes(1);
      expect(caller.signal.aborted).toBe(errorName === 'AbortError');
      expect(h.diagnostics).toHaveLength(1);
      expect(h.diagnostics[0]).toMatchObject({
        httpStatus: status,
        parsing: { status: 'notAttempted', code: 'search_cancelled' },
      });
    },
  );

  it('成功体读取结束时已取消，也不能解析来源或返回成功', async () => {
    const caller = new AbortController();
    const reason = new DOMException('读取结束时已取消', 'AbortError');
    const value =
      target.webSearchMode === 'bailianResponses'
        ? verified()
        : {
            status: 'completed',
            output: [
              { type: 'web_search_call', status: 'completed' },
              {
                type: 'message',
                content: [
                  {
                    type: 'output_text',
                    annotations: [
                      {
                        type: 'url_citation',
                        url: 'https://news.example.com/article/1',
                        title: '真实腾讯来源',
                      },
                    ],
                  },
                ],
              },
            ],
          };
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let readCount = 0;
    const response = responseWithReader(200, () => {
      if (readCount++ === 0)
        return Promise.resolve({ done: false, value: bytes });
      caller.abort(reason);
      return Promise.resolve({ done: true, value: undefined });
    });
    const h = harness(response);

    await expect(h.run(caller.signal)).rejects.toBe(reason);
    expect(h.fetchSpy).toHaveBeenCalledTimes(1);
    expect(h.diagnostics).toHaveLength(1);
    expect(h.diagnostics[0]).toMatchObject({
      httpStatus: 200,
      parsing: {
        status: 'notAttempted',
        sourceCount: 0,
        code: 'search_cancelled',
      },
    });
  });

  it.each([401, 500])(
    'HTTP %s 错误体非取消读取失败仍使用原 HTTP 受控错误',
    async (status) => {
      const response = responseWithReader(status, () =>
        Promise.reject(new Error('未公开的底层读取错误')),
      );
      const h = harness(response);
      const result = h.run();

      await expect(result).rejects.toMatchObject({
        code: 'search_http',
      });
      await expect(result).rejects.toThrow(`HTTP ${status}`);
      expect(h.fetchSpy).toHaveBeenCalledTimes(1);
      expect(h.diagnostics).toHaveLength(1);
      expect(h.diagnostics[0]).toMatchObject({
        httpStatus: status,
        parsing: { status: 'notAttempted', code: 'search_http' },
      });
      expect(h.diagnostics[0].parsing.message).not.toContain(
        '未公开的底层读取错误',
      );
    },
  );
});
