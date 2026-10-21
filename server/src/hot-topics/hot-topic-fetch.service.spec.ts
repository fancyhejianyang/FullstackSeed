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
  it('keeps a failed page outcome when hybrid search supplies valid sources', async () => {
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
    expect(result.sources.map((item) => item.status)).toEqual([
      'failed',
      'succeeded',
    ]);
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
    expect(result.candidates[0]).toMatchObject({
      sourceId: null,
      sourceName: 'www.douyin.com',
      accountId: null,
      accountName: null,
      accountMatched: false,
    });
    expect(result.sources[0].message).toContain('不代表');
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
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      sourceId: null,
      sourceName: 'www.douyin.com',
      accountId: null,
      accountName: null,
      accountMatched: false,
    });
    expect(
      result.sources.map((item) => ({
        status: item.status,
        count: item.count,
      })),
    ).toEqual([
      { status: 'skipped', count: 0 },
      { status: 'skipped', count: 0 },
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
      message: '未返回真实搜索来源',
    });
    expect(fetchText).not.toHaveBeenCalled();
  });
});
