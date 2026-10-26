import { HotTopicFetchService } from './hot-topic-fetch.service';
import { fetchHotSourceText, HotTopicFetchError } from './hot-topic-network';
import {
  DOUYIN_HOT_URL,
  NETEASE_NEWS_URL,
  type HotPreferenceInput,
  type HotSourceInput,
} from './hot-topic.types';
import type { KnowledgeWebSearchService } from '../knowledge-ai-providers/knowledge-web-search.service';
import type { HotSearchDiagnostics } from '../knowledge-ai-providers/knowledge-web-search-diagnostics';
import type { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';

jest.mock('./hot-topic-network', () => ({
  ...jest.requireActual<typeof import('./hot-topic-network')>(
    './hot-topic-network',
  ),
  fetchHotSourceText: jest.fn(),
}));
const fetchText = fetchHotSourceText as jest.Mock;
const preferences: HotPreferenceInput = {
  mode: 'hybrid',
  aiConfigId: 1,
  sourceIds: [1],
  interests: '科技',
  exclusions: '',
  audience: '',
  writingStyle: '',
  lookbackHours: 48,
  maxResults: 10,
  scheduleEnabled: false,
  scheduleTime: '09:00',
};
const source: HotSourceInput = {
  id: 1,
  name: '微博热点',
  kind: 'weiboHot',
  accessMode: 'page',
  url: 'https://weibo.com/hot',
  description: '',
  isEnabled: true,
};
const config = {} as AiFeatureConfig;
describe('HotTopicFetchService orchestration', () => {
  beforeEach(() => fetchText.mockReset());
  it('即使联网解析失败，也为各搜索来源保存同一次响应；平台直读结果保留', async () => {
    fetchText.mockResolvedValue(
      '<table><tr><td>1</td><td><a href="https://weibo.com/post/123">平台读取的新闻</a></td><td>123</td></tr></table>',
    );
    const diagnostic: HotSearchDiagnostics = {
      version: 1,
      providerId: 2,
      model: 'hy3',
      platformType: 'tencentTokenhub',
      protocol: 'openaiResponses',
      apiPath: '/v1/responses',
      httpStatus: 200,
      checkedAt: new Date().toISOString(),
      elapsedMilliseconds: 100,
      responseBody: '{"output":[{"type":"message"}]}',
      truncated: false,
      parsing: {
        status: 'failed',
        sourceCount: 0,
        code: 'search_unverified',
        message: '未返回搜索调用',
      },
    };
    const search = jest.fn(
      (...args: Parameters<KnowledgeWebSearchService['search']>) => {
        args[3]?.(diagnostic);
        return Promise.reject(
          new HotTopicFetchError('search_unverified', '未返回真实搜索来源'),
        );
      },
    );
    const result = await new HotTopicFetchService({
      search,
    } as unknown as KnowledgeWebSearchService).collect({
      sources: [
        source,
        {
          ...source,
          id: 2,
          name: '微博另一个榜单',
          kind: 'weiboHot',
          accessMode: 'search',
          url: 'https://weibo.com/hot',
        },
      ],
      mode: 'hybrid',
      config,
      preferences,
      signal: new AbortController().signal,
    });
    expect(search).toHaveBeenCalledTimes(1);
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0].searchDiagnostics).toEqual(diagnostic);
    expect(result.sources[0].message).toContain('平台读取');
    expect(result.sources[0].message).toContain('AI 联网');
    expect(result.sources[1]).toMatchObject({
      status: 'failed',
      searchResponseSourceIndex: 0,
    });
    expect(result.sources[1]).not.toHaveProperty('searchDiagnostics');
    expect(result.searchExecuted).toBe(false);
  });
  it('merges page and AI outcomes and keeps the successful acquisition', async () => {
    fetchText.mockResolvedValue('<html>动态页面</html>');
    const search = jest.fn().mockResolvedValue({
      searchExecuted: true,
      totalTokens: 42,
      sources: [
        {
          url: 'https://weibo.com/post/123',
          title: 'AI 搜索找到的新闻',
          summary: '来源概要',
          publishedAt: null,
        },
        {
          url: 'https://not-weibo.example.com/post',
          title: '其它站点',
          summary: '',
          publishedAt: null,
        },
      ],
    });
    const service = new HotTopicFetchService({
      search,
    } as unknown as KnowledgeWebSearchService);
    const result = await service.collect({
      sources: [source],
      mode: 'hybrid',
      config,
      preferences,
      signal: new AbortController().signal,
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      sourceName: '微博热点',
      status: 'succeeded',
      count: 1,
    });
    expect(result.sources[0].message).toContain('平台读取');
    expect(result.sources[0].message).toContain('AI 联网');
    expect(result.candidates[0]).toMatchObject({
      rank: null,
      heat: null,
      publishedAt: null,
      acquisition: 'aiSearch',
      accountMatched: false,
    });
    expect(result.searchExecuted).toBe(true);
    expect(result.totalTokens).toBe(42);
    expect(search).toHaveBeenCalledTimes(1);
  });
  it('falls back from an unreadable aggregator page to the official Weibo hot list', async () => {
    fetchText
      .mockRejectedValueOnce(new HotTopicFetchError('http', '来源拒绝访问'))
      .mockResolvedValueOnce(
        JSON.stringify({
          data: {
            band_list: [{ word: '微博热点一', realpos: 1, raw_hot: 9527 }],
          },
        }),
      );
    const weibo = {
      ...source,
      name: '微博热搜总榜',
      kind: 'weiboHot' as const,
      url: 'https://tophub.today/n/KqndgxeLl9',
    };
    const result = await new HotTopicFetchService({
      search: jest.fn(),
    } as unknown as KnowledgeWebSearchService).collect({
      sources: [weibo],
      mode: 'platform',
      config: null,
      preferences,
      signal: new AbortController().signal,
    });
    expect(result.candidates[0]).toMatchObject({
      title: '微博热点一',
      rank: 1,
      heat: 9527,
      sourceName: '微博热搜总榜',
    });
    expect(result.sources[0]).toMatchObject({
      status: 'succeeded',
      count: 1,
    });
    expect(result.sources[0].message).toContain('微博官方热搜接口');
    expect(fetchText.mock.calls[1]).toEqual([
      'https://weibo.com/ajax/statuses/hot_band',
      expect.objectContaining({ referer: 'https://weibo.com/' }),
    ]);
    expect(fetchText).toHaveBeenCalledTimes(2);
  });
  it('reads the side realtime list after both configured and existing official sources fail', async () => {
    fetchText
      .mockRejectedValueOnce(
        new HotTopicFetchError('http', '来源返回 HTTP 404'),
      )
      .mockRejectedValueOnce(new HotTopicFetchError('http', '来源拒绝访问'))
      .mockResolvedValueOnce(
        JSON.stringify({
          ok: 1,
          data: {
            realtime: [{ word: '辅助热搜词', realpos: 3, raw_hot: 1234 }],
            hotgovs: [{ word: '不应混入的置顶词' }],
          },
        }),
      );
    const signal = new AbortController().signal;
    const search = jest.fn();
    const result = await new HotTopicFetchService({
      search,
    } as unknown as KnowledgeWebSearchService).collect({
      sources: [{ ...source, url: 'https://tophub.today/node-items-by-date' }],
      mode: 'platform',
      config: null,
      preferences,
      signal,
    });
    expect(fetchText.mock.calls).toEqual([
      ['https://tophub.today/node-items-by-date', { signal }],
      [
        'https://weibo.com/ajax/statuses/hot_band',
        { signal, referer: 'https://weibo.com/' },
      ],
      [
        'https://weibo.com/ajax/side/hotSearch',
        { signal, referer: 'https://weibo.com/' },
      ],
    ]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      title: '辅助热搜词',
      sourceName: source.name,
      rank: 3,
      heat: 1234,
      acquisition: 'page',
    });
    expect(result.sources[0]).toMatchObject({ status: 'succeeded', count: 1 });
    expect(result.sources[0].message).toContain('已改用微博侧栏热搜辅助接口');
    expect(result.sources[0].message).toContain('微博官方热搜接口失败');
    expect(search).not.toHaveBeenCalled();
  });
  it('keeps trying the auxiliary endpoint when prior JSON contains no usable rows', async () => {
    fetchText
      .mockResolvedValueOnce('{"data":{}}')
      .mockResolvedValueOnce('{"data":{"band_list":[]}}')
      .mockResolvedValueOnce(
        '{"ok":1,"data":{"realtime":[{"word":"辅助榜单"}]}}',
      );
    const result = await new HotTopicFetchService({
      search: jest.fn(),
    } as unknown as KnowledgeWebSearchService).collect({
      sources: [source],
      mode: 'platform',
      config: null,
      preferences,
      signal: new AbortController().signal,
    });
    expect(fetchText).toHaveBeenCalledTimes(3);
    expect(result.candidates[0].title).toBe('辅助榜单');
    expect(result.sources[0].status).toBe('succeeded');
  });
  it('uses a configured side endpoint directly and stops after a valid realtime response', async () => {
    fetchText.mockResolvedValue(
      '{"ok":1,"data":{"realtime":[{"word":"直接侧栏词"}]}}',
    );
    const signal = new AbortController().signal;
    const result = await new HotTopicFetchService({
      search: jest.fn(),
    } as unknown as KnowledgeWebSearchService).collect({
      sources: [{ ...source, url: 'https://weibo.com/ajax/side/hotSearch' }],
      mode: 'platform',
      config: null,
      preferences,
      signal,
    });
    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(fetchText).toHaveBeenCalledWith(
      'https://weibo.com/ajax/side/hotSearch',
      { signal, referer: 'https://weibo.com/' },
    );
    expect(result.candidates[0].title).toBe('直接侧栏词');
    expect(result.sources[0].message).toContain('已读取微博侧栏热搜辅助接口');
  });
  it.each([
    'https://weibo.com/ajax/statuses/hot_band',
    'https://weibo.com/ajax/side/hotSearch',
  ])(
    'does not request an already configured official endpoint twice: %s',
    async (url) => {
      fetchText.mockRejectedValue(
        new HotTopicFetchError('http', '来源拒绝访问'),
      );
      const result = await new HotTopicFetchService({
        search: jest.fn(),
      } as unknown as KnowledgeWebSearchService).collect({
        sources: [{ ...source, url }],
        mode: 'platform',
        config: null,
        preferences,
        signal: new AbortController().signal,
      });
      const urls = (fetchText.mock.calls as [string, unknown][]).map(
        (call) => call[0],
      );
      expect(urls).toHaveLength(2);
      expect(new Set(urls).size).toBe(2);
      expect(urls[0]).toBe(url);
      expect(result.sources[0].status).toBe('failed');
    },
  );
  it('reports controlled reasons when all three sources fail without exposing raw errors', async () => {
    fetchText
      .mockRejectedValueOnce(
        new HotTopicFetchError('http', '来源返回 HTTP 404'),
      )
      .mockRejectedValueOnce(new Error('private-upstream-token'))
      .mockResolvedValueOnce('{"ok":1,"data":{"realtime":[]}}');
    const result = await new HotTopicFetchService({
      search: jest.fn(),
    } as unknown as KnowledgeWebSearchService).collect({
      sources: [source],
      mode: 'platform',
      config: null,
      preferences,
      signal: new AbortController().signal,
    });
    expect(fetchText).toHaveBeenCalledTimes(3);
    expect(result.candidates).toEqual([]);
    expect(result.sources[0]).toMatchObject({ status: 'failed', count: 0 });
    expect(result.sources[0].message).toContain('配置来源未能直读');
    expect(result.sources[0].message).toContain('微博官方热搜接口失败');
    expect(result.sources[0].message).toContain('微博侧栏热搜辅助接口失败');
    expect(result.sources[0].message).not.toContain('private-upstream-token');
  });
  it.each([1, 2])(
    'does not start further fallbacks after request %i is cancelled',
    async (cancelAt) => {
      const controller = new AbortController();
      if (cancelAt === 2)
        fetchText.mockRejectedValueOnce(
          new HotTopicFetchError('http', '读取失败'),
        );
      fetchText.mockImplementationOnce(() => {
        controller.abort();
        return Promise.reject(new Error('cancelled'));
      });
      const collecting = new HotTopicFetchService({
        search: jest.fn(),
      } as unknown as KnowledgeWebSearchService).collect({
        sources: [source],
        mode: 'platform',
        config: null,
        preferences,
        signal: controller.signal,
      });
      await expect(collecting).rejects.toBe(controller.signal.reason);
      expect(fetchText).toHaveBeenCalledTimes(cancelAt);
    },
  );
  it.each(['platform', 'hybrid', 'aiSearch'] as const)(
    'uses only the fixed Douyin endpoint in %s mode, including legacy search sources',
    async (mode) => {
      fetchText.mockResolvedValue(
        JSON.stringify({
          status_code: 0,
          data: {
            word_list: [
              {
                word: '抖音新闻',
                position: 1,
                hot_value: 123,
                event_time: Math.floor(Date.now() / 1000),
              },
            ],
          },
        }),
      );
      const search = jest.fn();
      const signal = new AbortController().signal;
      const result = await new HotTopicFetchService({
        search,
      } as unknown as KnowledgeWebSearchService).collect({
        sources: [
          {
            ...source,
            kind: 'douyinHot',
            accessMode: 'search',
            url: 'https://legacy.example.com/not-used',
          },
        ],
        mode,
        config: null,
        preferences,
        signal,
      });
      expect(fetchText).toHaveBeenCalledTimes(1);
      expect(fetchText).toHaveBeenCalledWith(DOUYIN_HOT_URL, { signal });
      expect(search).not.toHaveBeenCalled();
      expect(result.searchExecuted).toBe(false);
      expect(result.candidates[0]).toMatchObject({
        title: '抖音新闻',
        rank: 1,
        heat: 123,
        acquisition: 'page',
      });
      expect(result.sources[0].message).toContain('抖音固定热搜接口');
    },
  );
  it.each(['platform', 'hybrid', 'aiSearch'] as const)(
    'does not fall back to a page or AI after Douyin endpoint failure in %s mode',
    async (mode) => {
      fetchText.mockRejectedValue(
        new HotTopicFetchError('http', '来源拒绝访问'),
      );
      const search = jest.fn();
      const signal = new AbortController().signal;
      const result = await new HotTopicFetchService({
        search,
      } as unknown as KnowledgeWebSearchService).collect({
        sources: [{ ...source, kind: 'douyinHot' }],
        mode,
        config,
        preferences,
        signal,
      });
      expect(fetchText).toHaveBeenCalledTimes(1);
      expect(fetchText).toHaveBeenCalledWith(DOUYIN_HOT_URL, { signal });
      expect(search).not.toHaveBeenCalled();
      expect(result.candidates).toEqual([]);
      expect(result.sources[0]).toMatchObject({ status: 'failed', count: 0 });
      expect(result.sources[0].message).toContain('来源拒绝访问');
    },
  );
  it('empty sources default to fixed Douyin acquisition without an AI config', async () => {
    fetchText.mockResolvedValue('{"status_code":0,"data":{"word_list":[]}}');
    const search = jest.fn();
    const signal = new AbortController().signal;
    await new HotTopicFetchService({
      search,
    } as unknown as KnowledgeWebSearchService).collect({
      sources: [],
      mode: 'aiSearch',
      config: null,
      preferences,
      signal,
    });
    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(fetchText).toHaveBeenCalledWith(DOUYIN_HOT_URL, { signal });
    expect(search).not.toHaveBeenCalled();
  });
  it('excludes fixed Douyin from the search query when mixed with Weibo', async () => {
    fetchText.mockResolvedValue(
      JSON.stringify({
        status_code: 0,
        data: {
          word_list: [{ word: '固定抖音新闻', position: 1, hot_value: 123 }],
        },
      }),
    );
    const search = jest.fn().mockResolvedValue({
      searchExecuted: true,
      totalTokens: 42,
      sources: [
        {
          url: 'https://weibo.com/post/123',
          title: '真实微博新闻',
          summary: '',
          publishedAt: null,
        },
      ],
    });
    const signal = new AbortController().signal;
    const result = await new HotTopicFetchService({
      search,
    } as unknown as KnowledgeWebSearchService).collect({
      sources: [
        {
          ...source,
          id: 2,
          name: '抖音热点',
          kind: 'douyinHot',
          accessMode: 'search',
          url: 'https://legacy-douyin.example.com/not-used',
        },
        source,
      ],
      mode: 'aiSearch',
      config,
      preferences,
      signal,
    });
    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(fetchText).toHaveBeenCalledWith(DOUYIN_HOT_URL, { signal });
    expect(search).toHaveBeenCalledTimes(1);
    const requests = search.mock.calls as unknown as Array<
      Parameters<KnowledgeWebSearchService['search']>
    >;
    const query = requests[0][1];
    expect(query).toContain('weibo.com');
    expect(query).not.toContain('douyin');
    expect(query).not.toContain('抖音');
    expect(result.candidates.map((item) => item.title)).toEqual([
      '固定抖音新闻',
      '真实微博新闻',
    ]);
    expect(result.sources[0].message).not.toContain('AI 联网');
  });
  it.each(['platform', 'hybrid', 'aiSearch'] as const)(
    'uses the fixed NetEase endpoint in %s mode without AI search',
    async (mode) => {
      fetchText.mockResolvedValue(
        `var data = ${JSON.stringify({
          category: [{ n: '国内' }],
          news: [
            [
              {
                c: 0,
                t: '国内新闻',
                l: 'https://www.163.com/dy/article/DOMESTIC.html',
                p: new Date().toISOString(),
              },
            ],
          ],
        })};`,
      );
      const netease = {
        ...source,
        name: '网易国内新闻',
        kind: 'neteaseNews' as const,
        url: 'https://invalid.example.com/not-used',
      };
      const search = jest.fn();
      const signal = new AbortController().signal;
      const result = await new HotTopicFetchService({
        search,
      } as unknown as KnowledgeWebSearchService).collect({
        sources: [netease],
        mode,
        config: null,
        preferences,
        signal,
      });
      expect(result.candidates).toHaveLength(1);
      expect(result.sources[0].status).toBe('succeeded');
      expect(search).not.toHaveBeenCalled();
      expect(result.searchExecuted).toBe(false);
      expect(fetchText).toHaveBeenCalledWith(NETEASE_NEWS_URL, { signal });
    },
  );
  it('reports absent verified web results without falling back to AI memory', async () => {
    const search = jest
      .fn()
      .mockRejectedValue(
        new HotTopicFetchError('search_unverified', '未返回真实搜索来源'),
      );
    const result = await new HotTopicFetchService({
      search,
    } as unknown as KnowledgeWebSearchService).collect({
      sources: [source],
      mode: 'aiSearch',
      config,
      preferences,
      signal: new AbortController().signal,
    });
    expect(result.candidates).toEqual([]);
    expect(result.searchExecuted).toBe(false);
    expect(result.sources[0]).toMatchObject({
      sourceName: '微博热点',
      status: 'failed',
    });
    expect(result.sources[0].message).toContain('未返回真实搜索来源');
    expect(fetchText).not.toHaveBeenCalled();
  });
});
