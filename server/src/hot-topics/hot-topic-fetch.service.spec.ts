import { HotTopicFetchService } from './hot-topic-fetch.service';
import { fetchHotSourceText, HotTopicFetchError } from './hot-topic-network';
import type { HotPreferenceInput, HotSourceInput } from './hot-topic.types';
import type { KnowledgeWebSearchService } from '../knowledge-ai-providers/knowledge-web-search.service';
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
  name: '抖音热点',
  kind: 'douyinHot',
  accessMode: 'page',
  url: 'https://www.douyin.com/hot',
  accountId: '',
  accountName: '',
  description: '',
  isEnabled: true,
};
const config = {} as AiFeatureConfig;
describe('HotTopicFetchService orchestration', () => {
  beforeEach(() => fetchText.mockReset());
  it('merges page and AI outcomes and keeps the successful acquisition', async () => {
    fetchText.mockResolvedValue('<html>动态页面</html>');
    const search = jest.fn().mockResolvedValue({
      searchExecuted: true,
      totalTokens: 42,
      sources: [
        {
          url: 'https://www.douyin.com/video/123',
          title: 'AI 搜索找到的新闻',
          summary: '来源概要',
          publishedAt: null,
        },
        {
          url: 'https://not-douyin.example.com/post',
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
      sourceName: '抖音热点',
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
  it('never claims account identity from search and never searches automatically in platform mode', async () => {
    const search = jest.fn().mockResolvedValue({
      searchExecuted: true,
      totalTokens: null,
      sources: [
        {
          url: 'https://www.douyin.com/video/123',
          title: '相关新闻',
          summary: '',
          publishedAt: null,
        },
      ],
    });
    const service = new HotTopicFetchService({
      search,
    } as unknown as KnowledgeWebSearchService);
    const account = {
      ...source,
      kind: 'douyinAccount' as const,
      accountId: '1234',
      accountName: '指定作者',
      accessMode: 'search' as const,
    };
    const result = await service.collect({
      sources: [account],
      mode: 'aiSearch',
      config,
      preferences,
      signal: new AbortController().signal,
    });
    expect(result.candidates).toEqual([]);
    expect(result.sources[0]).toMatchObject({ status: 'failed', count: 0 });
    expect(result.sources[0].message).toContain('未命中配置的精确账号主页');
    search.mockClear();
    const skipped = await service.collect({
      sources: [account],
      mode: 'platform',
      config,
      preferences,
      signal: new AbortController().signal,
    });
    expect(search).not.toHaveBeenCalled();
    expect(skipped.sources[0].status).toBe('skipped');
  });
  it('never assigns the same domain results to multiple unverified official account names', async () => {
    const search = jest.fn().mockResolvedValue({
      searchExecuted: true,
      totalTokens: null,
      sources: [
        {
          url: 'https://www.douyin.com/video/123',
          title: '同站点新闻',
          summary: '',
          publishedAt: null,
        },
      ],
    });
    const sources = ['央视新闻', '央视网'].map((name, index) => ({
      ...source,
      id: index + 1,
      name,
      kind: 'douyinAccount' as const,
      accountId: `account-${index}`,
      accountName: name,
      accessMode: 'search' as const,
    }));
    const result = await new HotTopicFetchService({
      search,
    } as unknown as KnowledgeWebSearchService).collect({
      sources,
      mode: 'aiSearch',
      config,
      preferences,
      signal: new AbortController().signal,
    });
    expect(result.candidates).toEqual([]);
    expect(
      result.sources.map((item) => ({
        status: item.status,
        count: item.count,
      })),
    ).toEqual([
      { status: 'failed', count: 0 },
      { status: 'failed', count: 0 },
    ]);
  });
  it('uses the exact Douyin profile only as identity evidence, not as a hot topic', async () => {
    const accountId = 'MS4wLjABAAAA8U_l6rBzmy7bcy6xOJel4v0RzoR_wfAubGPeJimN__4';
    const profileUrl = `https://www.douyin.com/user/${accountId}`;
    const search = jest.fn().mockResolvedValue({
      searchExecuted: true,
      totalTokens: 18,
      sources: [
        {
          url: `${profileUrl}?from_tab_name=main`,
          title: '央视网的抖音主页',
          summary: '',
          publishedAt: null,
        },
        {
          url: 'https://www.douyin.com/user/another-account',
          title: '同平台其它账号',
          summary: '',
          publishedAt: null,
        },
      ],
    });
    const result = await new HotTopicFetchService({
      search,
    } as unknown as KnowledgeWebSearchService).collect({
      sources: [
        {
          ...source,
          name: '指定官媒',
          kind: 'douyinAccount',
          accessMode: 'search',
          url: profileUrl,
          accountName: '央视网',
          accountId,
        },
      ],
      mode: 'aiSearch',
      config,
      preferences,
      signal: new AbortController().signal,
    });
    expect(result.sources[0]).toMatchObject({ status: 'failed', count: 0 });
    expect(result.sources[0].message).toContain(
      '已命中配置的精确账号主页，但搜索结果没有携带可核验作者标识的具体作品',
    );
    expect(result.candidates).toEqual([]);
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
  });
  it('isolates per-source failures, strips secrets from error messages, and returns acquired data', async () => {
    fetchText
      .mockRejectedValueOnce(
        new Error('https://private.example.com?token=secret'),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          items: [{ title: '正常新闻', url: 'https://news.example.com/1' }],
        }),
      );
    const search = jest.fn();
    const service = new HotTopicFetchService({
      search,
    } as unknown as KnowledgeWebSearchService);
    const feed = {
      ...source,
      id: 2,
      name: '授权 Feed',
      kind: 'jsonFeed' as const,
      accessMode: 'feed' as const,
      url: 'https://feeds.example.com/json',
      apiToken: 'secret',
    };
    const result = await service.collect({
      sources: [source, feed],
      mode: 'platform',
      config: null,
      preferences,
      signal: new AbortController().signal,
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.sources[0].message).not.toContain('secret');
    expect(result.sources[1].status).toBe('succeeded');
    expect(search).not.toHaveBeenCalled();
    const secondCall = fetchText.mock.calls[1] as [
      string,
      { bearerToken?: string },
    ];
    expect(secondCall[1]).toMatchObject({ bearerToken: 'secret' });
  });
  it('reports absent verified web results without falling back to AI memory', async () => {
    const search = jest
      .fn()
      .mockRejectedValue(
        new HotTopicFetchError('search_unverified', '未返回真实搜索来源'),
      );
    const result = await new HotTopicFetchService({
      search,
    } as unknown as KnowledgeWebSearchService).collect({
      sources: [],
      mode: 'aiSearch',
      config,
      preferences,
      signal: new AbortController().signal,
    });
    expect(result.candidates).toEqual([]);
    expect(result.searchExecuted).toBe(false);
    expect(result.sources[0]).toMatchObject({
      sourceName: '抖音热点',
      status: 'failed',
    });
    expect(result.sources[0].message).toContain('未返回真实搜索来源');
    expect(fetchText).not.toHaveBeenCalled();
  });
});
