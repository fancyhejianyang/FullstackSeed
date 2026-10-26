import { parseHotTopicPayload } from './hot-topic-parsers';
import type { HotSourceInput } from './hot-topic.types';

const source: HotSourceInput = {
  id: 1,
  name: '测试热点',
  kind: 'douyinHot',
  accessMode: 'page',
  url: 'https://www.douyin.com/aweme/v1/web/hot/search/list/',
  isEnabled: true,
  description: '',
};
const at = '2026-10-21T08:00:00.000Z';
describe('hot topic source parsers (offline fixtures)', () => {
  it('reads only data.word_list and preserves missing time/rank as unknown', () => {
    const data = {
      status_code: 0,
      data: { word_list: [{ word: '科技新进展', hot_value: 123 }] },
    };
    const result = parseHotTopicPayload(JSON.stringify(data), source, at);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: '科技新进展',
      url: 'https://www.douyin.com/hot',
      heat: 123,
      rank: null,
      publishedAt: null,
      fetchedAt: at,
      acquisition: 'page',
    });
  });
  it('maps actual Douyin rank, heat, event time and sentence links without collecting other lists', () => {
    const data = {
      status_code: 0,
      data: {
        word_list: [
          {
            sentence_id: '7699694920800080483',
            word: '<b>真实热搜词</b>',
            position: 2,
            hot_value: 12170000,
            event_time: 1792569600,
          },
          {
            sentence_id: 124,
            word: '第二条热搜词',
            rank: '3',
            hot_value: '12345',
          },
        ],
        aweme_list: [{ aweme_id: '1', desc: '不能收录的作品' }],
        trending_list: [{ word: '不能收录的上升榜' }],
      },
      word_list: [{ word: '不能收录的顶层榜单' }],
    };
    const result = parseHotTopicPayload(JSON.stringify(data), source, at);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      accountMatched: false,
      accountId: null,
      title: '真实热搜词',
      url: 'https://www.douyin.com/hot/7699694920800080483',
      rank: 2,
      heat: 12170000,
      publishedAt: '2026-10-21T08:00:00.000Z',
    });
    expect(result[1]).toMatchObject({
      title: '第二条热搜词',
      url: 'https://www.douyin.com/hot/124',
      rank: 3,
      heat: 12345,
      publishedAt: null,
    });
  });
  it('rejects invalid sentence IDs and untrusted URLs instead of creating unsafe content links', () => {
    const invalidIds: unknown[] = [
      undefined,
      '../outside',
      'https://example.com/',
      '1?token=secret',
      '1'.repeat(65),
      Number.MAX_SAFE_INTEGER + 1,
      -1,
      1.5,
      {},
    ];
    const result = parseHotTopicPayload(
      JSON.stringify({
        data: {
          word_list: invalidIds.map((id, index) => ({
            word: `安全条目 ${index}`,
            sentence_id: id,
            url: 'javascript:alert(1)',
            share_url: 'https://unrelated.example/hot',
          })),
        },
      }),
      source,
      at,
    );
    expect(result).toHaveLength(invalidIds.length);
    expect(
      result.every((item) => item.url === 'https://www.douyin.com/hot'),
    ).toBe(true);
  });
  it('rejects browser checks and even embedded word_list HTML without executing JavaScript', () => {
    expect(() =>
      parseHotTopicPayload(
        '<html>验证码<script>window.run()</script></html>',
        source,
      ),
    ).toThrow('浏览器校验');
    expect(() =>
      parseHotTopicPayload(
        `<script id="RENDER_DATA">${encodeURIComponent(JSON.stringify({ data: { word_list: [{ word: '不可收录' }] } }))}</script>`,
        source,
      ),
    ).toThrow('有效榜单 JSON');
  });
  it('reads only domestic news from the fixed NetEase payload without executing JavaScript', () => {
    const netease = {
      ...source,
      name: '网易国内新闻',
      kind: 'neteaseNews' as const,
      url: 'https://news.163.com/special/0001220O/new_json2021.js',
    };
    const result = parseHotTopicPayload(
      `var data = ${JSON.stringify({
        category: [{ n: '国内' }, { n: '国际' }],
        news: [
          [
            {
              c: 0,
              t: '<b>国内要闻</b>',
              l: 'https://www.163.com/dy/article/DOMESTIC.html',
              p: '2026-10-23 14:38:12',
            },
            {
              c: 1,
              t: '不应收录的国际新闻',
              l: 'https://www.163.com/dy/article/WORLD.html',
              p: '2026-10-23 14:39:12',
            },
          ],
        ],
      })};`,
      netease,
      at,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: '国内要闻',
      url: 'https://www.163.com/dy/article/DOMESTIC.html',
      platform: '网易新闻',
      acquisition: 'page',
      publishedAt: '2026-10-23T06:38:12.000Z',
    });
    expect(() =>
      parseHotTopicPayload('var data = (() => {})();', netease),
    ).toThrow('有效 JSON');
    expect(() =>
      parseHotTopicPayload('var data = {"category":[],"news":[]};', netease),
    ).toThrow('国内分类');
  });
  it('reads Weibo hot band JSON, builds only safe search links and keeps missing heat/rank unknown', () => {
    const weibo = {
      ...source,
      kind: 'weiboHot' as const,
      url: 'https://weibo.com/ajax/statuses/hot_band',
    };
    const result = parseHotTopicPayload(
      JSON.stringify({
        band_list: [
          { word: '微博热点一', raw_hot: 1234567, realpos: 1, note: '热' },
          { word: '微博热点二', raw_hot: 2, word_scheme: '#热点二#' },
        ],
        hotgov: { word: '置顶议题', raw_hot: 9 },
      }),
      weibo,
      at,
    );
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      title: '微博热点一',
      platform: '微博',
      heat: 1234567,
      rank: 1,
      url: `https://s.weibo.com/weibo?q=${encodeURIComponent('#微博热点一#')}`,
      acquisition: 'page',
      publishedAt: null,
    });
    expect(result[1]).toMatchObject({
      title: '微博热点二',
      rank: null,
      url: `https://s.weibo.com/weibo?q=${encodeURIComponent('#热点二#')}`,
    });
    expect(result[2]).toMatchObject({ title: '置顶议题', heat: 9 });
    expect(parseHotTopicPayload('{"data":{"word_list":[]}}', weibo)).toEqual(
      [],
    );
  });
  it('reads server-rendered hot list tables (e.g. aggregator pages) without inventing links', () => {
    const weibo = {
      ...source,
      kind: 'weiboHot' as const,
      url: 'https://tophub.today/n/KqndgxeLl9',
    };
    const html = `<div class="jc"><table><tbody>
      <tr><td align="center">1.</td><td><a href="https://s.weibo.com/weibo?q=%E8%A5%BF%E8%97%8F%E5%9C%B0%E9%9C%87" target="_blank">西藏地震已致16死46伤</a></td><td class="ws">253万</td></tr>
      <tr><td align="center">2.</td><td><a href="/n/detail">相对地址条目</a></td><td class="ws">1.2万</td></tr>
      <tr><td align="center">3.</td><td><a href="javascript:;">跳过脚本链接</a></td><td class="ws">9万</td></tr>
      <tr><td align="center">4.</td><td><a href="https://s.weibo.com/weibo?q=%E8%A5%BF%E8%97%8F%E5%9C%B0%E9%9C%87">西藏地震已致16死46伤</a></td><td class="ws">253万</td></tr>
    </tbody></table></div>`;
    const result = parseHotTopicPayload(html, weibo, at);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      title: '西藏地震已致16死46伤',
      platform: '微博',
      rank: 1,
      heat: 2530000,
      url: 'https://s.weibo.com/weibo?q=%E8%A5%BF%E8%97%8F%E5%9C%B0%E9%9C%87',
    });
    expect(result[1]).toMatchObject({
      title: '相对地址条目',
      rank: 2,
      heat: 12000,
      url: 'https://tophub.today/n/detail',
    });
  });
  it.each([
    '',
    '   ',
    '{"data":{"word_list":[]}}',
    '{"data":{"word_list":[null,{"word":""},{"word":123}]}}',
  ])('rejects empty Douyin response or unusable word lists: %p', (body) => {
    expect(() => parseHotTopicPayload(body, source)).toThrow(
      '抖音固定热搜接口未返回',
    );
  });
  it.each([
    '{"text":"一条热点"}',
    '{"word_list":[{"word":"错误位置的词条"}]}',
    '{"data":{"word_list":{}}}',
    '{"aweme_list":[{"aweme_id":"1","desc":"不能替代榜单"}]}',
    '{"data":{"nested":{"word_list":[{"word":"不递归搜索榜单"}]}}}',
  ])(
    'rejects unknown Douyin schemas instead of harvesting unrelated content: %p',
    (body) => {
      expect(() => parseHotTopicPayload(body, source)).toThrow(
        '未返回 data.word_list 榜单',
      );
    },
  );
  it.each([1, -1, 'blocked', false, null])(
    'rejects an explicit unsuccessful Douyin status without leaking the raw message: %p',
    (statusCode) => {
      expect(() =>
        parseHotTopicPayload(
          JSON.stringify({
            status_code: statusCode,
            status_msg: 'untrusted secret-value',
            data: { word_list: [{ word: '不能被收录的失败响应' }] },
          }),
          source,
        ),
      ).toThrow('抖音固定热搜接口返回失败状态');
    },
  );
  it('deduplicates and caps Douyin entries without inventing invalid rank/heat/time', () => {
    const row = {
      word: '重复条目',
      sentence_id: '123',
      position: -2,
      hot_value: 'unknown',
      event_time: 'not a date',
    };
    const result = parseHotTopicPayload(
      JSON.stringify({ data: { word_list: [row, row] } }),
      source,
      at,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      rank: null,
      heat: null,
      publishedAt: null,
    });
    expect(
      parseHotTopicPayload(
        JSON.stringify({
          data: {
            word_list: Array.from({ length: 150 }, (_, index) => ({
              word: `榜单条目 ${index}`,
              sentence_id: String(index + 1),
            })),
          },
        }),
        source,
      ),
    ).toHaveLength(100);
  });
  it('preserves generic embedded JSON reading for non-fixed Weibo sources', () => {
    const weibo = {
      ...source,
      kind: 'weiboHot' as const,
      url: 'https://tophub.today/n/KqndgxeLl9',
    };
    const payload = { band_list: [{ word: '微博页面热搜', raw_hot: 123 }] };
    const result = parseHotTopicPayload(
      `<script id="RENDER_DATA">${encodeURIComponent(JSON.stringify(payload))}</script>`,
      weibo,
      at,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ title: '微博页面热搜', heat: 123 });
    expect(parseHotTopicPayload('{"text":"未知结构"}', weibo)).toEqual([]);
  });
  it('safely ignores unclosed markup', () => {
    expect(() =>
      parseHotTopicPayload('<script id="RENDER_DATA">'.repeat(2000), {
        ...source,
        kind: 'weiboHot',
      }),
    ).toThrow('没有可解析');
  });
});
