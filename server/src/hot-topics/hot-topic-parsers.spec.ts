import { parseHotTopicPayload } from './hot-topic-parsers';
import type { HotSourceInput } from './hot-topic.types';

const source: HotSourceInput = {
  id: 1,
  name: '测试热点',
  kind: 'douyinHot',
  accessMode: 'page',
  url: 'https://www.douyin.com/hot',
  isEnabled: true,
  description: '',
};
const at = '2026-10-21T08:00:00.000Z';
describe('hot topic source parsers (offline fixtures)', () => {
  it('reads URL-encoded RENDER_DATA without executing JavaScript and does not invent time/rank', () => {
    const data = {
      data: { word_list: [{ word: '科技新进展', hot_value: 123 }] },
    };
    const result = parseHotTopicPayload(
      `<script id="RENDER_DATA">${encodeURIComponent(JSON.stringify(data))}</script>`,
      source,
      at,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: '科技新进展',
      heat: 123,
      rank: null,
      publishedAt: null,
      fetchedAt: at,
      acquisition: 'page',
    });
  });
  it('parses nested __NEXT_DATA__ without treating author metadata as a configured binding', () => {
    const data = {
      props: {
        aweme_list: [
          {
            aweme_id: '123',
            desc: '作者真正的作品',
            author: {
              nickname: '指定作者',
              sec_uid: 'MS4wLjABAAAA-123',
            },
            create_time: 1792569600,
          },
          {
            aweme_id: '124',
            desc: '同名其它作者',
            author: { nickname: '指定作者', sec_uid: 'different' },
          },
        ],
      },
    };
    const result = parseHotTopicPayload(
      `<script id="__NEXT_DATA__">${JSON.stringify(data)}</script>`,
      source,
      at,
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      accountMatched: false,
      accountId: 'MS4wLjABAAAA-123',
      title: '作者真正的作品',
      url: 'https://www.douyin.com/video/123',
      publishedAt: '2026-10-21T08:00:00.000Z',
    });
  });
  it('parses a direct Douyin post-list JSON response with title and published time', () => {
    const result = parseHotTopicPayload(
      JSON.stringify({
        status_code: 0,
        aweme_list: [
          {
            aweme_id: '7699694920800080483',
            desc: '军训拉练经过村庄，退伍老兵在路边驻足敬礼',
            author: { sec_uid: 'MS4wLjABAAAA-123' },
            create_time: 1792569600,
          },
        ],
      }),
      source,
      at,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      accountMatched: false,
      title: '军训拉练经过村庄，退伍老兵在路边驻足敬礼',
      url: 'https://www.douyin.com/video/7699694920800080483',
      publishedAt: '2026-10-21T08:00:00.000Z',
    });
  });
  it('rejects pages without embedded hotspot JSON', () => {
    expect(() =>
      parseHotTopicPayload(
        '<html>验证码<script>window.run()</script></html>',
        source,
      ),
    ).toThrow('没有可解析');
  });
  it('reads explicit JSON feeds, sanitizes text, and rejects unsafe article links', () => {
    const feed = {
      ...source,
      kind: 'jsonFeed' as const,
      accessMode: 'feed' as const,
    };
    const result = parseHotTopicPayload(
      JSON.stringify({
        items: [
          {
            title: '<b>今日科技</b>',
            url: 'https://news.example.com/1',
            summary: '正常<script>bad()</script>摘要',
            rank: 2,
            publishedAt: '2026-10-21T08:00:00Z',
          },
          { title: '内网内容', url: 'http://127.0.0.1/secret' },
          { title: '不安全链接', url: 'javascript:alert(1)' },
        ],
      }),
      feed,
      at,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: '今日科技',
      summary: '正常摘要',
      rank: 2,
      acquisition: 'feed',
      publishedAt: at,
    });
  });
  it('supports RSS CDATA and Atom alternate links without evaluating entities', () => {
    const rss = {
      ...source,
      kind: 'rss' as const,
      accessMode: 'feed' as const,
    };
    expect(
      parseHotTopicPayload(
        '<rss><channel><item><title><![CDATA[新闻 &amp; 科技]]></title><link>https://news.example.com/?a=1&amp;b=2</link><description><![CDATA[<p>摘要</p>]]></description><pubDate>Wed, 21 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>',
        rss,
        at,
      )[0],
    ).toMatchObject({
      title: '新闻 & 科技',
      url: 'https://news.example.com/?a=1&b=2',
      summary: '摘要',
      publishedAt: at,
    });
    expect(
      parseHotTopicPayload(
        '<feed><entry><title>Atom 新闻</title><link rel="self" href="https://news.example.com/api"/><link rel="alternate" href="https://news.example.com/post"/><updated>2026-10-21T08:00:00Z</updated></entry></feed>',
        rss,
        at,
      )[0].url,
    ).toBe('https://news.example.com/post');
    expect(() =>
      parseHotTopicPayload(
        '<!DOCTYPE rss [<!ENTITY a SYSTEM "file:///etc/passwd">]><rss></rss>',
        rss,
      ),
    ).toThrow('DTD');
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
    // 非热榜来源不套用表格兜底，行为保持原来的「无可解析 JSON」失败。
    expect(() =>
      parseHotTopicPayload(html, { ...source, kind: 'jsonFeed' as const }),
    ).toThrow('页面中没有可解析的热点 JSON');
  });
  it('returns no fabricated items for empty structured data or unknown JSON schemas', () => {
    expect(parseHotTopicPayload('{"data":{"word_list":[]}}', source)).toEqual(
      [],
    );
    expect(parseHotTopicPayload('{"text":"一条热点"}', source)).toEqual([]);
  });
  it('bounds external ranks and safely ignores unclosed markup', () => {
    const feed = {
      ...source,
      kind: 'jsonFeed' as const,
      accessMode: 'feed' as const,
    };
    const rows = parseHotTopicPayload(
      JSON.stringify({
        items: [
          { title: '超大排名', url: 'https://news.example.com/1', rank: 1e30 },
          { title: '非整数排名', url: 'https://news.example.com/2', rank: 1.2 },
        ],
      }),
      feed,
    );
    expect(rows.map((row) => row.rank)).toEqual([null, null]);
    expect(() =>
      parseHotTopicPayload('<script id="RENDER_DATA">'.repeat(2000), source),
    ).toThrow('没有可解析');
  });
});
