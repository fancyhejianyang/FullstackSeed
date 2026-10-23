import { HotTopicFetchService } from './hot-topic-fetch.service';
import { fetchHotSourceText, HotTopicFetchError } from './hot-topic-network';
import {
  NETEASE_NEWS_URL,
  type HotPreferenceInput,
  type HotSourceInput,
} from './hot-topic.types';
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
