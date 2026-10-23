import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { isHostOf, type HotTopicAnalysis } from './hot-topic.types';

export const HOT_TOPIC_DEADLINE_MS = 5 * 60 * 1000;
export const HOT_TOPIC_LEASE_MS = 30 * 1000;

export function nextScheduledAt(time: string, now = new Date()): Date {
  const local = new Date(now.getTime() + 8 * 3600_000);
  const [hour, minute] = time.split(':').map(Number);
  const result = new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
      hour - 8,
      minute,
    ),
  );
  if (result.getTime() <= now.getTime())
    result.setUTCDate(result.getUTCDate() + 1);
  return result;
}

export function topicUrlHash(raw: string, title?: string): string {
  const url = new URL(raw);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|from$|share_|timestamp$|source$)/i.test(key))
      url.searchParams.delete(key);
  }
  url.searchParams.sort();
  const isDouyinLanding =
    isHostOf(url.hostname, 'douyin.com') &&
    /^(?:\/hot(?:\/.*)?|\/search(?:\/.*)?|\/user\/[^/]+\/?|\/)$/.test(
      url.pathname,
    );
  // 微博热搜榜、汇总页与登录落地页同样是容器地址：不同词条不得以同一链接去重。
  const isWeiboLanding =
    isHostOf(url.hostname, 'weibo.com') &&
    /^(?:\/(?:hot\/search|top\/summary|newlogin|ajax\/statuses\/hot_band)(?:\/.*)?|\/)$/.test(
      url.pathname,
    );
  // A leaderboard/profile URL identifies a container, not the individual event.
  const identity =
    (isDouyinLanding || isWeiboLanding) && title?.trim()
      ? `${url.toString()}\n${title.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()}`
      : url.toString();
  return createHash('sha256').update(identity).digest('hex');
}

export function parseTopicAnalysis(
  answer: string,
  count: number,
): HotTopicAnalysis[] {
  const normalized = answer
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new BadRequestException('AI 推荐结果不是有效 JSON，已保留采集内容');
  }
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? (parsed as { recommendations?: unknown }).recommendations
      : null;
  if (!Array.isArray(rows) || rows.length > count)
    throw new BadRequestException('AI 推荐结果结构不正确，已保留采集内容');
  const seen = new Set<number>();
  return rows.map((value: unknown) => {
    if (!value || typeof value !== 'object')
      throw new BadRequestException('AI 推荐条目格式不正确');
    const row = value as Record<string, unknown>;
    if (
      typeof row.index !== 'number' ||
      !Number.isInteger(row.index) ||
      row.index < 0 ||
      row.index >= count ||
      seen.has(row.index)
    )
      throw new BadRequestException('AI 推荐条目编号无效或重复');
    if (
      !['high', 'medium', 'low'].includes(String(row.recommendationLevel)) ||
      typeof row.reason !== 'string' ||
      !row.reason.trim() ||
      row.reason.length > 2000 ||
      !Array.isArray(row.suggestedAngles) ||
      row.suggestedAngles.length > 5 ||
      row.suggestedAngles.some(
        (angle: unknown) => typeof angle !== 'string' || angle.length > 500,
      )
    )
      throw new BadRequestException('AI 推荐字段不符合协议');
    seen.add(row.index);
    return {
      index: row.index,
      recommendationLevel:
        row.recommendationLevel as HotTopicAnalysis['recommendationLevel'],
      reason: row.reason,
      suggestedAngles: row.suggestedAngles as string[],
      materialCompleteness:
        row.materialCompleteness === 'summary' ? 'summary' : 'titleOnly',
    };
  });
}

/** Never persist raw provider response bodies, credential-bearing URLs or request configs. */
export function safeHotTopicError(error: unknown): string {
  const message = error instanceof Error ? error.message : '热点任务执行失败';
  return message
    .replace(/Bearer\s+[^\s;,]+/gi, 'Bearer [已隐藏]')
    .replace(/([?&](?:token|access_token|api_key|key)=)[^&\s]+/gi, '$1[已隐藏]')
    .replace(/(?:sk-|sk_)[A-Za-z0-9_-]+/g, '[已隐藏]')
    .slice(0, 500);
}
