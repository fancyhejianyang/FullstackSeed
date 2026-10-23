import { Injectable } from '@nestjs/common';
import type { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import { KnowledgeWebSearchService } from '../knowledge-ai-providers/knowledge-web-search.service';
import {
  fetchHotSourceText,
  HotTopicFetchError,
  normalizeHotTopicLink,
  safeHotTopicError,
} from './hot-topic-network';
import { parseHotTopicPayload } from './hot-topic-parsers';
import {
  isHostOf,
  platformLabelForHost,
  platformSource,
  type HotPreferenceInput,
  type HotSourceInput,
  type HotTopicCandidate,
  type HotTopicFetchResult,
  type HotTopicMode,
} from './hot-topic.types';

const WEIBO_HOT_FALLBACK_URL = 'https://weibo.com/ajax/statuses/hot_band';

function sourceHost(source: HotSourceInput): string | null {
  const platformHost = platformSource(source.kind)?.host;
  if (platformHost) return platformHost;
  const url = normalizeHotTopicLink(source.url);
  return url ? new URL(url).hostname.replace(/^www\./, '') : null;
}
function matchesSource(url: string, source: HotSourceInput) {
  const host = sourceHost(source);
  const actual = new URL(url).hostname;
  return Boolean(host && (actual === host || actual.endsWith(`.${host}`)));
}
function matchesAccountProfile(url: string, source: HotSourceInput) {
  if (source.kind !== 'douyinAccount' || !source.accountId.trim()) return false;
  try {
    const actual = new URL(url);
    const configured = new URL(source.url);
    const normalizePath = (value: string) =>
      decodeURIComponent(value).replace(/\/+$/, '');
    return (
      isHostOf(actual.hostname, 'douyin.com') &&
      normalizePath(actual.pathname) === normalizePath(configured.pathname) &&
      normalizePath(actual.pathname) === `/user/${source.accountId.trim()}`
    );
  } catch {
    return false;
  }
}
function mergeSourceOutcome(
  outcomes: HotTopicFetchResult['sources'],
  outcome: HotTopicFetchResult['sources'][number],
  channel: '平台读取' | 'AI 联网',
) {
  const current = outcomes.find(
    (item) =>
      item.sourceId === outcome.sourceId &&
      item.sourceName === outcome.sourceName,
  );
  const message = `${channel}：${outcome.message}`;
  if (!current) {
    outcomes.push({ ...outcome, message });
    return;
  }
  current.count += outcome.count;
  if (current.status !== 'succeeded' && outcome.status === 'succeeded')
    current.status = 'succeeded';
  else if (current.status === 'skipped' && outcome.status === 'failed')
    current.status = 'failed';
  current.message = `${current.message}；${message}`.slice(0, 1000);
}
export const DEFAULT_HOT_SOURCE: HotSourceInput = {
  id: 0,
  name: '抖音热点',
  kind: 'douyinHot',
  accessMode: 'page',
  url: 'https://www.douyin.com/hot',
  accountName: '',
  accountId: '',
  isEnabled: true,
  description: '公开热点页；动态内容不可读时明确失败，可选择 AI 联网补充。',
};

@Injectable()
export class HotTopicFetchService {
  constructor(private readonly webSearch: KnowledgeWebSearchService) {}

  private async readPageSource(
    source: HotSourceInput,
    fetchedAt: string,
    signal: AbortSignal,
  ) {
    try {
      const body = await fetchHotSourceText(source.url, {
        signal,
        bearerToken:
          source.accessMode === 'feed' && source.kind === 'jsonFeed'
            ? source.apiToken
            : undefined,
      });
      return {
        candidates: parseHotTopicPayload(body, source, fetchedAt),
        message: '已读取配置来源的公开结构化数据',
      };
    } catch (primaryError) {
      const configured = normalizeHotTopicLink(source.url);
      if (source.kind !== 'weiboHot' || configured === WEIBO_HOT_FALLBACK_URL)
        throw primaryError;
      try {
        const body = await fetchHotSourceText(WEIBO_HOT_FALLBACK_URL, {
          signal,
          referer: 'https://weibo.com/',
        });
        return {
          candidates: parseHotTopicPayload(
            body,
            { ...source, url: WEIBO_HOT_FALLBACK_URL },
            fetchedAt,
          ),
          message: `配置页面未能直读（${safeHotTopicError(primaryError)}），已改用微博官方热搜接口`,
        };
      } catch (fallbackError) {
        throw new HotTopicFetchError(
          'weibo_unavailable',
          `配置页面未能直读（${safeHotTopicError(primaryError)}），微博官方热搜回退也失败（${safeHotTopicError(fallbackError)}）`,
        );
      }
    }
  }

  async collect(input: {
    sources: HotSourceInput[];
    mode: HotTopicMode;
    config: AiFeatureConfig | null;
    preferences: HotPreferenceInput;
    signal: AbortSignal;
  }): Promise<HotTopicFetchResult> {
    if (input.sources.length > 5)
      throw new HotTopicFetchError(
        'too_many_sources',
        '每次最多选择 5 个热点来源',
      );
    const sources = input.sources.length
      ? input.sources.filter((source) => source.isEnabled)
      : [DEFAULT_HOT_SOURCE];
    const result: HotTopicFetchResult = {
      candidates: [],
      sources: [],
      searchExecuted: false,
      totalTokens: null,
    };
    const fetchedAt = new Date().toISOString();
    if (input.mode !== 'aiSearch') {
      for (const source of sources) {
        input.signal.throwIfAborted();
        if (source.accessMode === 'search') {
          if (input.mode === 'platform')
            result.sources.push({
              sourceId: source.id || null,
              sourceName: source.name,
              status: 'skipped',
              count: 0,
              message: '该来源采用 AI 搜索，请切换为 AI 联网或混合模式',
            });
          continue;
        }
        try {
          const platform = platformSource(source.kind);
          if (
            platform?.host &&
            source.accessMode === 'page' &&
            !matchesSource(source.url, source)
          )
            throw new HotTopicFetchError(
              'invalid_platform',
              `${platform.label}账号来源页面采集仅支持 ${platform.host} 官方域名`,
            );
          const direct = await this.readPageSource(
            source,
            fetchedAt,
            input.signal,
          );
          const candidates = direct.candidates;
          result.candidates.push(...candidates);
          mergeSourceOutcome(
            result.sources,
            {
              sourceId: source.id || null,
              sourceName: source.name,
              status: candidates.length ? 'succeeded' : 'failed',
              count: candidates.length,
              message: candidates.length
                ? direct.message
                : '来源没有返回可用且符合账号约束的数据',
            },
            '平台读取',
          );
        } catch (error) {
          input.signal.throwIfAborted();
          mergeSourceOutcome(
            result.sources,
            {
              sourceId: source.id || null,
              sourceName: source.name,
              status: 'failed',
              count: 0,
              message: safeHotTopicError(error),
            },
            '平台读取',
          );
        }
      }
    }
    if (input.mode !== 'platform' && sources.length) {
      input.signal.throwIfAborted();
      try {
        if (!input.config)
          throw new HotTopicFetchError(
            'missing_ai',
            'AI 联网模式需要选择热点发现 AI 配置',
          );
        const constraints = sources.map((source) => ({
          name: source.name,
          site: sourceHost(source),
          url: source.url,
          accountName: source.accountName || undefined,
          accountId: source.accountId || undefined,
        }));
        const search = await this.webSearch.search(
          input.config,
          `当前采集时间：${fetchedAt}。检索最近 ${input.preferences.lookbackHours} 小时的热点事件。\n` +
            `限定来源（只返回这些站点的原始网页）：${JSON.stringify(constraints)}\n` +
            `关注领域：${input.preferences.interests}；排除方向：${input.preferences.exclusions}。\n` +
            `最多 ${input.preferences.maxResults} 条。账号名称仅作为查询条件，不能声称验证了作者身份。不得把搜索索引序号当热点排名。`,
          input.signal,
        );
        result.searchExecuted = search.searchExecuted;
        result.totalTokens = search.totalTokens;
        const verifiedAccountUrls = new Set<string>();
        for (const source of sources.filter(
          (item) => item.kind === 'douyinAccount',
        )) {
          const profiles = search.sources.filter((item) =>
            matchesAccountProfile(item.url, source),
          );
          for (const item of profiles) {
            verifiedAccountUrls.add(item.url);
          }
        }
        // One unscoped search result is one candidate. Account profile pages are
        // identity evidence, not hot topics, and must not be saved as content.
        for (const item of search.sources) {
          if (verifiedAccountUrls.has(item.url)) continue;
          const matchedSources = sources.filter((source) =>
            matchesSource(item.url, source),
          );
          if (!matchedSources.length) continue;
          const unscoped = matchedSources.filter(
            (source) => source.kind !== 'douyinAccount' && !source.accountId,
          );
          if (!unscoped.length) continue;
          const host = new URL(item.url).hostname;
          const candidate: HotTopicCandidate = {
            ...item,
            sourceName: host.slice(0, 120),
            sourceId: unscoped.length === 1 ? unscoped[0].id || null : null,
            platform: platformLabelForHost(host) ?? host.slice(0, 40),
            accountName: null,
            accountId: null,
            accountMatched: false,
            rank: null,
            heat: null,
            fetchedAt,
            acquisition: 'aiSearch',
          };
          result.candidates.push(candidate);
        }
        for (const source of sources) {
          const matches = search.sources.filter((item) =>
            matchesSource(item.url, source),
          );
          const accountRestricted =
            source.kind === 'douyinAccount' || Boolean(source.accountId);
          const accountProfiles = accountRestricted
            ? search.sources.filter((item) =>
                matchesAccountProfile(item.url, source),
              )
            : [];
          const verified = accountRestricted ? [] : matches;
          mergeSourceOutcome(
            result.sources,
            {
              sourceId: source.id || null,
              sourceName: source.name,
              status: verified.length ? 'succeeded' : 'failed',
              count: verified.length,
              message: verified.length
                ? '仅收录供应商返回的真实搜索来源，时间和热度缺失时保持未知'
                : accountRestricted && accountProfiles.length
                  ? '已命中配置的精确账号主页，但搜索结果没有携带可核验作者标识的具体作品；未将主页或同域名资料当作热点'
                  : accountRestricted && matches.length
                    ? '搜索返回了同平台资料，但未命中配置的精确账号主页或稳定账号标识'
                    : `没有返回该来源的可核验结果；未用其它网站代替${input.mode === 'aiSearch' && source.accessMode !== 'search' ? '。当前为仅 AI 联网模式，未直接读取配置页面' : ''}`,
            },
            'AI 联网',
          );
        }
      } catch (error) {
        input.signal.throwIfAborted();
        for (const source of sources)
          mergeSourceOutcome(
            result.sources,
            {
              sourceId: source.id || null,
              sourceName: source.name,
              status: 'failed',
              count: 0,
              message: safeHotTopicError(error),
            },
            'AI 联网',
          );
      }
    }
    const seen = new Set<string>();
    const earliest = Date.now() - input.preferences.lookbackHours * 3600000;
    result.candidates = result.candidates
      .filter((item) => {
        // Unknown publication time is retained as unknown, not silently rewritten to now.
        if (item.publishedAt && Date.parse(item.publishedAt) < earliest)
          return false;
        const key = `${item.url}\n${item.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, Math.max(1, Math.min(100, input.preferences.maxResults)));
    return result;
  }
}
