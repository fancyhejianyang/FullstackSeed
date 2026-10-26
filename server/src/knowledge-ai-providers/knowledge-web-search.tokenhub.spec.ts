import { BadRequestException } from '@nestjs/common';
import type { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import type { KnowledgeAiProvidersService } from './knowledge-ai-providers.service';
import { KnowledgeWebSearchService } from './knowledge-web-search.service';
import {
  buildVerifiedSearchRequest,
  parseTokenhubSearchResponse,
} from './knowledge-web-search.utils';

const link = 'https://news.example.com/article/123';
const chat = () => ({
  choices: [
    {
      finish_reason: 'stop',
      message: {
        content: JSON.stringify({
          items: [
            { url: 'https://fake.example.com', publishedAt: '2099-01-01' },
          ],
        }),
        search_results: [
          {
            url: link,
            name: '来源标题',
            snippet: '来源原始摘要',
            date: '2099-01-01',
          },
        ],
      },
    },
  ],
  usage: { prompt_tokens: 11, completion_tokens: 7 },
});
const responses = () => ({
  // 官方示例不包含顶层 status，完成的调用项才是执行证据。
  output: [
    { type: 'web_search_call', status: 'completed', action: { query: '新闻' } },
    {
      type: 'message',
      content: [
        {
          type: 'output_text',
          text: '回答摘要不能作为原网页摘要，发布日期 2099-01-01 不能作为元数据。',
          annotations: [{ type: 'url_citation', url: link, title: '引用标题' }],
        },
      ],
    },
  ],
});
const config = {
  isEnabled: true,
  featureType: 'topicDiscovery',
  providerId: 1,
  model: 'deepseek-v4-flash',
  webSearchMode: 'tokenhubSearch',
  enableThinking: false,
} as AiFeatureConfig;

describe('腾讯联网搜索请求与真实来源', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(['openaiChatSearch', 'openaiResponses'] as const)(
    '按 %s 使用腾讯工具与显式思考参数，不发送百炼参数',
    (protocol) => {
      const body = buildVerifiedSearchRequest({
        webSearchMode: 'tokenhubSearch',
        protocol,
        model: config.model!,
        query: '最近新闻',
      });
      expect(body).toMatchObject({ model: config.model, stream: false });
      expect(body).not.toHaveProperty('enable_thinking');
      if (protocol === 'openaiChatSearch') {
        expect(body.web_search_options).toEqual({
          enable: true,
          search_source: 'lite',
        });
        expect(body.reasoning_effort).toBe('low');
        expect(body).not.toHaveProperty('input');
      } else {
        expect(body.tools).toEqual([
          { type: 'web_search', search_source: 'lite' },
        ]);
        expect(body.reasoning).toEqual({ effort: 'low' });
        expect(body).not.toHaveProperty('messages');
      }
    },
  );
  it('拒绝将腾讯 Chat 搜索协议配给百炼方式', () => {
    expect(() =>
      buildVerifiedSearchRequest({
        webSearchMode: 'bailianResponses',
        protocol: 'openaiChatSearch',
        model: 'qwen-plus',
        query: '新闻',
      }),
    ).toThrow('协议不匹配');
  });
  it('Chat 只采用结构化来源与摘要，忽略正文链接与所有推测日期', () => {
    expect(parseTokenhubSearchResponse(chat(), 'openaiChatSearch')).toEqual({
      sources: [
        {
          url: link,
          title: '来源标题',
          summary: '来源原始摘要',
          publishedAt: null,
        },
      ],
      searchExecuted: true,
      totalTokens: 18,
    });
  });
  it('Responses 以完成调用与结构化引用核实搜索，不补原文摘要或日期', () => {
    expect(parseTokenhubSearchResponse(responses(), 'openaiResponses')).toEqual(
      {
        sources: [
          { url: link, title: '引用标题', summary: '', publishedAt: null },
        ],
        searchExecuted: true,
        totalTokens: null,
      },
    );
  });
  it.each([
    {},
    {
      choices: [
        {
          message: { content: '来源 https://news.example.com/article/123 [1]' },
        },
      ],
      usage: { tool_usage: { web_search_call: 1 } },
    },
    {
      choices: [
        {
          message: {
            search_results: [
              { url: 'http://127.0.0.1', name: '私网' },
              { url: link },
            ],
          },
        },
      ],
    },
  ])('Chat 缺少可核验来源时不使用正文或用量补造：%j', (body) => {
    expect(() => parseTokenhubSearchResponse(body, 'openaiChatSearch')).toThrow(
      '可核验',
    );
  });
  it.each(['length', 'tool_calls', 'error'])(
    'Chat 未正常完成时拒绝部分结果：%s',
    (finish_reason) => {
      const body = chat();
      body.choices[0].finish_reason = finish_reason;
      expect(() =>
        parseTokenhubSearchResponse(body, 'openaiChatSearch'),
      ).toThrow('未正常完成');
    },
  );
  it.each([
    {
      output: [responses().output[1]],
      usage: { tool_usage: { web_search_call: 1 } },
    },
    {
      output: [
        {
          type: 'web_search_call',
          status: 'completed',
          action: {
            sources: [{ url: link, title: '百炼字段不能冒充腾讯引用' }],
          },
        },
      ],
    },
    { status: 'incomplete', ...responses() },
    { error: { message: 'upstream error' }, ...responses() },
  ])('Responses 仅有调用、引用、用量或错误时不能冒充完整来源：%j', (body) => {
    expect(() =>
      parseTokenhubSearchResponse(body, 'openaiResponses'),
    ).toThrow();
  });
  it('重复链接去重，不返回未知的用量', () => {
    const body = chat();
    body.choices[0].message.search_results.push(
      body.choices[0].message.search_results[0],
    );
    expect(
      parseTokenhubSearchResponse(body, 'openaiChatSearch').sources,
    ).toHaveLength(1);
    expect(
      parseTokenhubSearchResponse(
        { ...body, usage: { total_tokens: -1 } },
        'openaiChatSearch',
      ).totalTokens,
    ).toBeNull();
  });
  it.each(['openaiChatSearch', 'openaiResponses'] as const)(
    '业务按共享解析的真实地址和协议只提交一次：%s',
    async (protocol) => {
      const target = {
        webSearchMode: 'tokenhubSearch',
        model: protocol === 'openaiResponses' ? 'hy3' : config.model,
        protocol,
        url:
          'https://tokenhub.tencentmaas.com/v1/' +
          (protocol === 'openaiResponses' ? 'responses' : 'chat/completions'),
        secretKey: 'fixture-search-key',
      };
      const resolveWebSearchTarget = jest.fn().mockResolvedValue(target);
      const service = new KnowledgeWebSearchService({
        resolveWebSearchTarget,
      } as unknown as KnowledgeAiProvidersService);
      const fetchMock = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response(
            JSON.stringify(
              protocol === 'openaiResponses' ? responses() : chat(),
            ),
          ),
        );
      const result = await service.search(
        { ...config, model: target.model },
        '最近新闻',
        new AbortController().signal,
      );
      expect(result.searchExecuted).toBe(true);
      expect(resolveWebSearchTarget).toHaveBeenCalledWith({
        id: 1,
        model: target.model,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(target.url);
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer fixture-search-key',
      });
      expect(init?.redirect).toBe('error');
    },
  );
  it('不支持的自动联网平台在发送前拒绝，保留清楚原因', async () => {
    const resolveWebSearchTarget = jest
      .fn()
      .mockRejectedValue(
        new BadRequestException('当前账号不支持系统自动联网补充'),
      );
    const service = new KnowledgeWebSearchService({
      resolveWebSearchTarget,
    } as unknown as KnowledgeAiProvidersService);
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    await expect(
      service.search(config, '新闻', new AbortController().signal),
    ).rejects.toThrow('不支持系统自动联网补充');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('已取消的任务不解析账号，也不发出新调用', async () => {
    const resolveWebSearchTarget = jest.fn();
    const service = new KnowledgeWebSearchService({
      resolveWebSearchTarget,
    } as unknown as KnowledgeAiProvidersService);
    const abort = new AbortController();
    abort.abort(new Error('已取消'));
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    await expect(service.search(config, '新闻', abort.signal)).rejects.toThrow(
      '已取消',
    );
    expect(resolveWebSearchTarget).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('免费额度错误显示专用中文且不自动重投，不输出供应商原文', async () => {
    const resolveWebSearchTarget = jest.fn().mockResolvedValue({
      model: config.model,
      webSearchMode: 'tokenhubSearch',
      protocol: 'openaiChatSearch',
      url: 'https://tokenhub.tencentmaas.com/v1/chat/completions',
      secretKey: 'fixture-search-key',
    });
    const service = new KnowledgeWebSearchService({
      resolveWebSearchTarget,
    } as unknown as KnowledgeAiProvidersService);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message:
              'No free trial quota is available for the service and postpaid billing is not enabled',
          },
        }),
        { status: 402 },
      ),
    );
    await expect(
      service.search(config, '新闻', new AbortController().signal),
    ).rejects.toThrow('该服务暂无免费额度，且未开启按量付费，请开通后重试。');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
