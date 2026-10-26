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
        : source.kind === 'neteaseNews'
          ? '网易新闻'
          : source.kind.startsWith('douyin')
            ? '抖音'
            : '热点来源',
    accountName: null,
    accountId: null,
    accountMatched: false,
    rank: null,
    heat: null,
    publishedAt: null,
    fetchedAt,
    acquisition: 'page',
  };
}

/** 抖音固定热搜接口只接受 data.word_list，不能将网页或作品列表冒充榜单。 */
function parseDouyinHotList(
  body: string,
  source: HotSourceInput,
  fetchedAt: string,
): HotTopicCandidate[] {
  if (!body.trim())
    throw new HotTopicFetchError(
      'empty_douyin',
      '抖音固定热搜接口未返回榜单，响应内容为空',
    );
  let payload: Record<string, unknown>;
  try {
    payload = hotRecord(JSON.parse(body) as unknown);
  } catch {
    throw new HotTopicFetchError(
      'invalid_douyin',
      '抖音固定热搜接口未返回有效榜单 JSON，可能存在浏览器校验或访问限制',
    );
  }
  if (
    'status_code' in payload &&
    payload.status_code !== 0 &&
    payload.status_code !== '0'
  )
    throw new HotTopicFetchError(
      'douyin_unavailable',
      '抖音固定热搜接口返回失败状态，未采集榜单，请检查接口访问限制',
    );
  const rows = hotRecord(payload.data).word_list;
  if (!Array.isArray(rows))
    throw new HotTopicFetchError(
      'invalid_douyin',
      '抖音固定热搜接口未返回 data.word_list 榜单，请检查返回结构或访问限制',
    );
  const output: HotTopicCandidate[] = [];
  const seen = new Set<string>();
  for (const value of rows.slice(0, 100)) {
    const row = hotRecord(value);
    const title = hotPlainText(row.word, 300);
    if (!title) continue;
    // 大整数编码必须保留字符串，不能把失真的 JS 数值或任意路径当作词条 ID。
    const sentenceId = identifier(row.sentence_id);
    const url = /^[1-9]\d{0,63}$/.test(sentenceId)
      ? `https://www.douyin.com/hot/${sentenceId}`
      : 'https://www.douyin.com/hot';
    const key = `${url}\n${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({
      ...base(source, fetchedAt),
      title,
      url,
      rank: rank(row.position ?? row.rank),
      heat: number(row.hot_value),
      publishedAt: hotPublishedAt(row.event_time),
    });
  }
  if (!output.length)
    throw new HotTopicFetchError(
      'empty_douyin',
      '抖音固定热搜接口未返回可用榜单条目，data.word_list 为空或没有有效标题',
    );
  return output;
}

function isWeiboRealtimeSource(source: HotSourceInput): boolean {
  if (source.kind !== 'weiboHot') return false;
  try {
    const url = new URL(source.url);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'weibo.com' &&
      url.pathname === '/ajax/side/hotSearch'
    );
  } catch {
    return false;
  }
}

/** 微博侧栏接口只收录 data.realtime，不混入置顶、推荐或其它榜单。 */
function parseWeiboRealtime(
  body: string,
  source: HotSourceInput,
  fetchedAt: string,
): HotTopicCandidate[] {
  if (!body.trim())
    throw new HotTopicFetchError(
      'empty_weibo_realtime',
      '微博辅助热搜接口响应为空，未返回可用榜单',
    );
  let payload: Record<string, unknown>;
  try {
    payload = hotRecord(JSON.parse(body) as unknown);
  } catch {
    throw new HotTopicFetchError(
      'invalid_weibo_realtime',
      '微博辅助热搜接口未返回有效 JSON，可能需要授权或人工验证',
    );
  }
  if (
    payload.error ||
    ('ok' in payload &&
      payload.ok !== 1 &&
      payload.ok !== '1' &&
      payload.ok !== true) ||
    (payload.error_code !== undefined &&
      payload.error_code !== null &&
      payload.error_code !== 0 &&
      payload.error_code !== '0')
  )
    throw new HotTopicFetchError(
      'weibo_realtime_unavailable',
      '微博辅助热搜接口返回失败状态，可能需要授权或人工验证',
    );
  const rows = hotRecord(payload.data).realtime;
  if (!Array.isArray(rows))
    throw new HotTopicFetchError(
      'invalid_weibo_realtime',
      '微博辅助热搜接口未返回 data.realtime 榜单',
    );
  // 仅将已确认的列表交给既有微博词条解析，不递归采集原响应的其它字段。
  const output = parseJsonData({ band_list: rows }, source, fetchedAt);
  if (!output.length)
    throw new HotTopicFetchError(
      'empty_weibo_realtime',
      '微博辅助热搜接口 data.realtime 为空或没有有效词条',
    );
  return output;
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
  let visited = 0;
  function visit(value: unknown, depth: number) {
    if (++visited > 20000 || depth > 24 || output.length >= 100) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const object = hotRecord(value);
    if (source.kind === 'weiboHot') {
      const hotgov: unknown[] = Array.isArray(object.hotgov)
        ? (object.hotgov as unknown[])
        : hotRecord(object.hotgov).word
          ? [object.hotgov]
          : [];
      const rows: unknown[] = [
        ...(Array.isArray(object.band_list)
          ? (object.band_list as unknown[])
          : []),
        ...(Array.isArray(object.Events) ? (object.Events as unknown[]) : []),
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
    if (Array.isArray(object.word_list)) {
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
        const id = identifier(item.aweme_id);
        const link =
          normalizeHotTopicLink(item.share_url) ??
          (/^\d+$/.test(id) ? `https://www.douyin.com/video/${id}` : null);
        add({
          ...base(source, fetchedAt),
          title: hotPlainText(item.desc, 300),
          summary: hotPlainText(item.desc),
          url: link ?? '',
          accountId: ids[0] || null,
          accountName: hotPlainText(author.nickname, 120) || null,
          accountMatched: false,
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
function blocks(body: string) {
  const opening = /<(script)\b/gi;
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

function neteasePublishedAt(value: unknown) {
  const raw = string(value).trim();
  // 网易接口的无时区时间按其国内新闻发布时间（Asia/Shanghai）还原。
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw))
    return hotPublishedAt(`${raw.replace(' ', 'T')}+08:00`);
  return hotPublishedAt(value);
}

function parseNeteaseDomesticNews(
  body: string,
  source: HotSourceInput,
  fetchedAt: string,
): HotTopicCandidate[] {
  // 固定接口是 var data = JSON;，只去除已知包裹并解析 JSON，绝不执行 JS。
  const payload = /^\s*var\s+data\s*=\s*([\s\S]*?)\s*;?\s*$/.exec(body)?.[1];
  let data: Record<string, unknown>;
  try {
    if (!payload) throw new Error('missing data');
    data = hotRecord(JSON.parse(payload) as unknown);
  } catch {
    throw new HotTopicFetchError(
      'invalid_netease',
      '网易新闻接口 data 不是有效 JSON',
    );
  }
  if (!Array.isArray(data.category) || !Array.isArray(data.news))
    throw new HotTopicFetchError(
      'invalid_netease',
      '网易新闻接口缺少分类或新闻列表',
    );
  const categories = data.category.map((category) =>
    hotPlainText(hotRecord(category).n, 40),
  );
  if (!categories.includes('国内'))
    throw new HotTopicFetchError(
      'invalid_netease',
      '网易新闻接口未包含国内分类',
    );
  const output: HotTopicCandidate[] = [];
  const seen = new Set<string>();
  for (const item of data.news.flat()) {
    const row = hotRecord(item);
    const categoryIndex = rank(row.c);
    // The supplied endpoint labels index 0 as “国内”. If that mapping changes,
    // no record is emitted rather than mislabeling another category as domestic.
    if (categoryIndex === null || categories[categoryIndex] !== '国内')
      continue;
    const title = hotPlainText(row.t, 300);
    const url = normalizeHotTopicLink(row.l);
    if (!title || !url || seen.has(`${url}\n${title}`)) continue;
    seen.add(`${url}\n${title}`);
    output.push({
      ...base(source, fetchedAt),
      title,
      summary: hotPlainText(row.digest ?? row.summary ?? row.d),
      url,
      publishedAt: neteasePublishedAt(row.p),
    });
    if (output.length >= 100) break;
  }
  return output;
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
    const anchor =
      /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/i.exec(
        row,
      );
    if (!anchor) continue;
    const title = hotPlainText(anchor[2], 300);
    const url = title.length >= 2 ? hotLink(anchor[1], source.url) : null;
    if (!title || !url || seen.has(`${url}\n${title}`)) continue;
    seen.add(`${url}\n${title}`);
    const cells = cellTexts(row);
    const position = Number.parseInt(
      (cells[0] ?? '').replace(/[^\d]/g, ''),
      10,
    );
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
  if (source.kind === 'neteaseNews')
    return parseNeteaseDomesticNews(body, source, fetchedAt);
  if (source.kind === 'douyinHot')
    return parseDouyinHotList(body, source, fetchedAt);
  if (isWeiboRealtimeSource(source))
    return parseWeiboRealtime(body, source, fetchedAt);
  if (body.trimStart().startsWith('{') || body.trimStart().startsWith('[')) {
    try {
      return parseJsonData(JSON.parse(body) as unknown, source, fetchedAt);
    } catch (error) {
      if (error instanceof HotTopicFetchError) throw error;
      throw new HotTopicFetchError('invalid_json', '来源 JSON 格式无效');
    }
  }
  const candidates: HotTopicCandidate[] = [];
  for (const block of blocks(body)) {
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
      '页面中没有可解析的热点 JSON；可能需要验证码或动态加载，请使用 AI 联网补充',
    );
  return candidates.slice(0, 100);
}
