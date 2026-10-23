import { HOT_LIST_KINDS } from './hot-topic.types';
import type { HotSourceInput, HotTopicCandidate } from './hot-topic.types';
import {
  HOT_SOURCE_BYTE_LIMIT,
  HotTopicFetchError,
  normalizeHotTopicLink,
} from './hot-topic-network';

export function hotRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function string(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function identifier(value: unknown): string {
  return typeof value === 'string' && value.length <= 160
    ? value
    : typeof value === 'number' && Number.isSafeInteger(value)
      ? String(value)
      : '';
}
function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function rank(value: unknown): number | null {
  const parsed = number(value);
  return parsed !== null && Number.isInteger(parsed) && parsed <= 2147483647
    ? parsed
    : null;
}
function entities(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
    (_, key: string) => {
      if (key[0] === '#') {
        const n =
          key[1].toLowerCase() === 'x'
            ? parseInt(key.slice(2), 16)
            : parseInt(key.slice(1), 10);
        return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
          ? String.fromCodePoint(n)
          : '';
      }
      return (
        { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<
          string,
          string
        >
      )[key.toLowerCase()];
    },
  );
}
export function hotPlainText(value: unknown, limit = 3000): string {
  return entities(
    string(value)
      .slice(0, limit * 4)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'),
  )
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '')
    .split('')
    .filter(
      (character) =>
        character.charCodeAt(0) >= 32 || ['\t', '\n', '\r'].includes(character),
    )
    .join('')
    .trim()
    .slice(0, limit);
}
export function hotPublishedAt(value: unknown): string | null {
  let timestamp: number;
  if (typeof value === 'number' && Number.isFinite(value))
    timestamp = value < 1e12 ? value * 1000 : value;
  else if (typeof value === 'string' && /\d{4}/.test(value))
    timestamp = Date.parse(value);
  else return null;
  return Number.isFinite(timestamp) &&
    timestamp >= 0 &&
    timestamp <= 8640000000000000
    ? new Date(timestamp).toISOString()
    : null;
}
function base(source: HotSourceInput, fetchedAt: string): HotTopicCandidate {
  return {
    title: '',
    summary: '',
    url: '',
    sourceName: source.name,
    sourceId: source.id || null,
    platform:
      source.kind === 'weiboHot'
        ? '微博'
        : source.kind.startsWith('douyin')
          ? '抖音'
          : source.kind === 'rss'
            ? 'RSS'
            : 'JSON Feed',
    accountName: null,
    accountId: null,
    accountMatched: false,
    rank: null,
    heat: null,
    publishedAt: null,
    fetchedAt,
    acquisition: source.accessMode === 'page' ? 'page' : 'feed',
  };
}

function parseJsonData(
  data: unknown,
  source: HotSourceInput,
  fetchedAt: string,
): HotTopicCandidate[] {
  const output: HotTopicCandidate[] = [];
  const seen = new Set<string>();
  function add(item: HotTopicCandidate) {
    if (!item.title || !item.url || seen.has(`${item.url}\n${item.title}`))
      return;
    seen.add(`${item.url}\n${item.title}`);
    output.push(item);
  }
  // Explicit feed schema; no heuristics that treat arbitrary JSON text as a news item.
  const feed = hotRecord(data).items;
  if (Array.isArray(feed) && source.kind === 'jsonFeed') {
    for (const raw of feed.slice(0, 100)) {
      const item = hotRecord(raw);
      const accountId = identifier(item.accountId);
      if (source.accountId && source.accountId !== accountId) continue;
      add({
        ...base(source, fetchedAt),
        title: hotPlainText(item.title, 300),
        summary: hotPlainText(item.summary),
        url: normalizeHotTopicLink(item.url) ?? '',
        publishedAt: hotPublishedAt(item.publishedAt),
        accountId: accountId || null,
        accountName: hotPlainText(item.accountName, 120) || null,
        accountMatched: Boolean(
          source.accountId && source.accountId === accountId,
        ),
        rank: rank(item.rank),
        heat: number(item.heat),
      });
    }
    return output;
  }
  let visited = 0;
  function visit(value: unknown, depth: number) {
    if (++visited > 20000 || depth > 24 || output.length >= 100) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const object = hotRecord(value);
    if (source.kind === 'weiboHot') {
      const hotgov = Array.isArray(object.hotgov)
        ? object.hotgov
        : hotRecord(object.hotgov).word
          ? [object.hotgov]
          : [];
      const rows = [
        ...(Array.isArray(object.band_list) ? object.band_list : []),
        ...(Array.isArray(object.Events) ? object.Events : []),
        ...hotgov,
      ].slice(0, 100);
      for (const raw of rows) {
        const row = hotRecord(raw);
        const word = hotPlainText(row.word, 300);
        if (!word) continue;
        // 微博词条没有自带原文链接时只生成搜索地址，不臆造原文；名次与热度缺失保持未知。
        const scheme = string(row.word_scheme).trim() || `#${word}#`;
        add({
          ...base(source, fetchedAt),
          title: word,
          summary: hotPlainText(row.note),
          url:
            normalizeHotTopicLink(row.url ?? row.share_url) ??
            `https://s.weibo.com/weibo?q=${encodeURIComponent(scheme)}`,
          rank: rank(row.realpos ?? row.rank ?? row.position),
          heat: number(row.raw_hot ?? row.num ?? row.hot_value),
          publishedAt: hotPublishedAt(row.event_time),
        });
      }
    }
    if (Array.isArray(object.word_list) && source.kind !== 'douyinAccount') {
      for (const raw of object.word_list.slice(0, 100)) {
        const word = hotRecord(raw);
        add({
          ...base(source, fetchedAt),
          title: hotPlainText(word.word, 300),
          summary: '',
          url:
            normalizeHotTopicLink(word.url ?? word.share_url) ??
            normalizeHotTopicLink(source.url) ??
            '',
          rank: rank(word.position ?? word.rank),
          heat: number(word.hot_value),
          publishedAt: hotPublishedAt(word.event_time),
        });
      }
    }
    if (Array.isArray(object.aweme_list)) {
      for (const raw of object.aweme_list.slice(0, 100)) {
        const item = hotRecord(raw);
        const author = hotRecord(item.author);
        const ids = [identifier(author.sec_uid), identifier(author.uid)].filter(
          Boolean,
        );
        const matched = Boolean(
          source.accountId && ids.includes(source.accountId),
        );
        // Nicknames do not identify an account; never substitute a model-inferred owner.
        if (source.kind === 'douyinAccount' && !matched) continue;
        const id = identifier(item.aweme_id);
        const link =
          normalizeHotTopicLink(item.share_url) ??
          (/^\d+$/.test(id) ? `https://www.douyin.com/video/${id}` : null);
        add({
          ...base(source, fetchedAt),
          title: hotPlainText(item.desc, 300),
          summary: hotPlainText(item.desc),
          url: link ?? '',
          accountId: matched ? source.accountId : ids[0] || null,
          accountName: hotPlainText(author.nickname, 120) || null,
          accountMatched: matched,
          publishedAt: hotPublishedAt(item.create_time),
        });
      }
    }
    for (const [key, child] of Object.entries(object))
      if (
        !['word_list', 'aweme_list', 'band_list', 'hotgov', 'Events'].includes(
          key,
        )
      )
        visit(child, depth + 1);
  }
  visit(data, 0);
  return output;
}

/** Linear outer scanning avoids quadratic regex backtracking on unclosed untrusted tags. */
function blocks(body: string, kind: 'script' | 'rss') {
  const opening = kind === 'script' ? /<(script)\b/gi : /<(item|entry)\b/gi;
  const lower = body.toLowerCase();
  const result: Array<{ attributes: string; content: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = opening.exec(body)) && result.length < 200) {
    const openEnd = body.indexOf('>', opening.lastIndex);
    if (openEnd < 0) break;
    const closeStart = lower.indexOf(
      `</${match[1].toLowerCase()}`,
      openEnd + 1,
    );
    if (closeStart < 0) break;
    const closeEnd = body.indexOf('>', closeStart);
    if (closeEnd < 0) break;
    result.push({
      attributes: body.slice(opening.lastIndex, openEnd).slice(0, 4096),
      content: body.slice(openEnd + 1, closeStart),
    });
    opening.lastIndex = closeEnd + 1;
  }
  return result;
}

function parseRss(
  body: string,
  source: HotSourceInput,
  fetchedAt: string,
): HotTopicCandidate[] {
  // A deliberately limited RSS/Atom reader: no DTD, entities, network access, or executable HTML.
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(body))
    throw new HotTopicFetchError(
      'xml_entity',
      'RSS 不允许 DTD 或自定义实体声明',
    );
  if (!/<(?:rss|feed)\b/i.test(body))
    throw new HotTopicFetchError(
      'invalid_rss',
      '来源不是受支持的 RSS 或 Atom 文档',
    );
  const result: HotTopicCandidate[] = [];
  for (const block of blocks(body, 'rss')) {
    if (result.length >= 100) break;
    const inner = block.content.slice(0, 64000);
    const field = (name: string) =>
      new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}\\s*>`, 'i').exec(
        inner,
      )?.[1] ?? '';
    const links = [...inner.matchAll(/<link\b([^>]*)\/?\s*>/gi)];
    const alternate = links.find(
      (m) =>
        !/\brel\s*=/.test(m[1]) || /\brel\s*=\s*["']alternate["']/i.test(m[1]),
    );
    const href = alternate
      ? /\bhref\s*=\s*["']([^"']+)["']/i.exec(alternate[1])?.[1]
      : '';
    const url = normalizeHotTopicLink(
      entities(href || hotPlainText(field('link'))),
    );
    const title = hotPlainText(field('title'), 300);
    if (!url || !title) continue;
    result.push({
      ...base(source, fetchedAt),
      title,
      url,
      summary: hotPlainText(
        field('description') || field('summary') || field('content'),
      ),
      publishedAt: hotPublishedAt(
        hotPlainText(
          field('pubDate') || field('published') || field('updated'),
        ),
      ),
    });
  }
  return result;
}

/** 榜单数值常见于第三方聚合页的「253 万」写法，转换是还原而非推测；无法识别时保持未知。 */
function hotCount(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)\s*([万亿]?)$/.exec(value.trim());
  if (!match) return null;
  const factor = match[2] === '亿' ? 1e8 : match[2] === '万' ? 1e4 : 1;
  const parsed = Number(match[1]) * factor;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
/** 相对地址按来源页解析，避免臆造域名；javascript: 等非链接协议直接丢弃。 */
function hotLink(href: string, sourceUrl: string): string | null {
  const candidate = entities(href).trim();
  if (!candidate || /^(?:javascript|mailto|tel|data):/i.test(candidate))
    return null;
  try {
    return normalizeHotTopicLink(new URL(candidate, sourceUrl).toString());
  } catch {
    return null;
  }
}
/** Linear scanning keeps cost proportional to the page size on untrusted markup. */
function cellTexts(row: string, limit = 12): string[] {
  const lower = row.toLowerCase();
  const result: string[] = [];
  let cursor = 0;
  while (result.length < limit) {
    const start = lower.indexOf('<td', cursor);
    if (start < 0) break;
    const openEnd = row.indexOf('>', start);
    const end = lower.indexOf('</td>', openEnd);
    if (openEnd < 0 || end < 0) break;
    cursor = end + 5;
    result.push(hotPlainText(row.slice(openEnd + 1, end), 60));
  }
  return result;
}
/**
 * 服务端渲染的榜单表格（如第三方聚合页）：只读「序号 + 标题链接 + 热度」，
 * 不解析页面上的其它文案，也不因为站点结构变化而臆造条目。
 */
function parseHotTable(
  body: string,
  source: HotSourceInput,
  fetchedAt: string,
): HotTopicCandidate[] {
  const output: HotTopicCandidate[] = [];
  const seen = new Set<string>();
  const lower = body.toLowerCase();
  let cursor = 0;
  let rows = 0;
  while (output.length < 100 && rows < 200) {
    const start = lower.indexOf('<tr', cursor);
    if (start < 0) break;
    const openEnd = body.indexOf('>', start);
    const end = lower.indexOf('</tr>', openEnd);
    if (openEnd < 0 || end < 0) break;
    cursor = end + 5;
    rows += 1;
    const row = body.slice(openEnd + 1, end);
    const anchor = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/i.exec(
      row,
    );
    if (!anchor) continue;
    const title = hotPlainText(anchor[2], 300);
    const url = title.length >= 2 ? hotLink(anchor[1], source.url) : null;
    if (!title || !url || seen.has(`${url}\n${title}`)) continue;
    seen.add(`${url}\n${title}`);
    const cells = cellTexts(row);
    const position = Number.parseInt((cells[0] ?? '').replace(/[^\d]/g, ''), 10);
    const heat = cells.map(hotCount).find((value) => value !== null) ?? null;
    output.push({
      ...base(source, fetchedAt),
      title,
      summary: '',
      url,
      rank: Number.isInteger(position) && position > 0 ? position : null,
      heat,
    });
  }
  return output;
}

export function parseHotTopicPayload(
  body: string,
  source: HotSourceInput,
  fetchedAt = new Date().toISOString(),
): HotTopicCandidate[] {
  if (Buffer.byteLength(body, 'utf8') > HOT_SOURCE_BYTE_LIMIT)
    throw new HotTopicFetchError('too_large', '来源响应超过 3 MB 限制');
  if (source.kind === 'douyinAccount' && !source.accountId.trim())
    throw new HotTopicFetchError(
      'missing_account',
      '抖音账号采集需要精确 UID 或 sec_uid，不能仅凭昵称确认作者',
    );
  if (source.kind === 'rss') return parseRss(body, source, fetchedAt);
  if (body.trimStart().startsWith('{') || body.trimStart().startsWith('[')) {
    try {
      return parseJsonData(JSON.parse(body) as unknown, source, fetchedAt);
    } catch (error) {
      if (error instanceof HotTopicFetchError) throw error;
      throw new HotTopicFetchError('invalid_json', '来源 JSON 格式无效');
    }
  }
  const candidates: HotTopicCandidate[] = [];
  for (const block of blocks(body, 'script')) {
    if (
      !/\bid\s*=\s*["'](?:RENDER_DATA|__NEXT_DATA__|SIGI_STATE|__INITIAL_STATE__)["']/i.test(
        block.attributes,
      ) &&
      !/\btype\s*=\s*["']application\/json["']/i.test(block.attributes)
    )
      continue;
    let data = block.content.trim();
    if (data.startsWith('%')) {
      try {
        data = decodeURIComponent(data);
      } catch {
        continue;
      }
    }
    try {
      candidates.push(
        ...parseJsonData(JSON.parse(data) as unknown, source, fetchedAt),
      );
    } catch {
      /* An unsupported script is not executable. */
    }
  }
  if (!candidates.length && HOT_LIST_KINDS.includes(source.kind))
    candidates.push(...parseHotTable(body, source, fetchedAt));
  if (!candidates.length)
    throw new HotTopicFetchError(
      'dynamic_page',
      source.kind === 'douyinAccount'
        ? '页面中没有可解析且 UID 匹配的账号作品；可能需要登录、验证码或动态加载，请使用授权 JSON Feed 或 AI 联网补充'
        : '页面中没有可解析的热点 JSON；可能需要验证码或动态加载，请使用授权 Feed 或 AI 联网补充',
    );
  return candidates.slice(0, 100);
}
