import { parseHotTopicPayload } from './hot-topic-parsers';
import type { HotSourceInput } from './hot-topic.types';

const source: HotSourceInput = {
  id: 1,
  name: '测试热点',
  kind: 'douyinHot',
  accessMode: 'page',
  url: 'https://www.douyin.com/hot',
  accountName: '',
  accountId: '',
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
  it('parses nested __NEXT_DATA__ but does not use account nicknames as identity', () => {
    const account = {
      ...source,
      kind: 'douyinAccount' as const,
      accountName: '指定作者',
      accountId: 'MS4wLjABAAAA-123',
    };
    const data = {
      props: {
        aweme_list: [
          {
            aweme_id: '123',
            desc: '作者真正的作品',
            author: { nickname: '指定作者', sec_uid: account.accountId },
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
      account,
      at,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      accountMatched: true,
      accountId: account.accountId,
      title: '作者真正的作品',
      url: 'https://www.douyin.com/video/123',
    });
  });
  it('rejects an account source with only a name, and pages without embedded JSON', () => {
    expect(() =>
      parseHotTopicPayload('{}', {
        ...source,
        kind: 'douyinAccount',
        accountName: '作者',
      }),
    ).toThrow('精确 UID');
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
