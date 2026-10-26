import { Injectable } from '@nestjs/common';
import type { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import { KnowledgeWebSearchService } from '../knowledge-ai-providers/knowledge-web-search.service';
import type { HotSearchDiagnostics } from '../knowledge-ai-providers/knowledge-web-search-diagnostics';
import {
  fetchHotSourceText,
  HotTopicFetchError,
  normalizeHotTopicLink,
  safeHotTopicError,
} from './hot-topic-network';
import { parseHotTopicPayload } from './hot-topic-parsers';
import { compactHotSearchResponses } from './hot-topic-search-response';
import {
  platformLabelForHost,
  platformSource,
  DOUYIN_HOT_URL,
  fixedHotSourceUrl,
  type HotPreferenceInput,
  type HotSourceInput,
  type HotTopicCandidate,
  type HotTopicFetchResult,
  type HotTopicMode,
} from './hot-topic.types';

const WEIBO_HOT_FALLBACKS = [
  {
    url: 'https://weibo.com/ajax/statuses/hot_band',
    label: '微博官方热搜接口',
  },
  {
    url: 'https://weibo.com/ajax/side/hotSearch',
    label: '微博侧栏热搜辅助接口',
  },
] as const;

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
  if (outcome.searchDiagnostics)
    current.searchDiagnostics = outcome.searchDiagnostics;
}
export const DEFAULT_HOT_SOURCE: HotSourceInput = {
  id: 0,
  name: '抖音热点',
  kind: 'douyinHot',
  accessMode: 'page',
  url: DOUYIN_HOT_URL,
  isEnabled: true,
  description:
    '仅通过抖音固定热搜接口读取；访问受限时明确失败，不回退网页或 AI 搜索。',
};

@Injectable()
export class HotTopicFetchService {
  constructor(private readonly webSearch: KnowledgeWebSearchService) {}

  private async readPageSource(
    source: HotSourceInput,
    fetchedAt: string,
    signal: AbortSignal,
  ) {
    const fixedUrl = fixedHotSourceUrl(source.kind);
    const fixedSource = fixedUrl
      ? { ...source, accessMode: 'page' as const, url: fixedUrl }
      : source;
    const configured = normalizeHotTopicLink(fixedSource.url);
    const configuredWeiboEndpoint =
      source.kind === 'weiboHot'
        ? WEIBO_HOT_FALLBACKS.find((item) => item.url === configured)
        : undefined;
    try {
      const body = await fetchHotSourceText(fixedSource.url, {
        signal,
        ...(configuredWeiboEndpoint ? { referer: 'https://weibo.com/' } : {}),
      });
      const candidates = parseHotTopicPayload(body, fixedSource, fetchedAt);
      if (source.kind === 'weiboHot' && !candidates.length)
        throw new HotTopicFetchError(
          'empty_weibo',
          '微博来源未返回可用的热搜榜单条目',
        );
      return {
        candidates,
        message:
          source.kind === 'douyinHot'
            ? '已读取抖音固定热搜接口数据'
            : configuredWeiboEndpoint
              ? `已读取${configuredWeiboEndpoint.label}`
              : '已读取配置来源的公开结构化数据',
      };
    } catch (primaryError) {
      if (source.kind !== 'weiboHot') throw primaryError;
      signal.throwIfAborted();
      const failures = [
        `配置来源未能直读（${safeHotTopicError(primaryError)}）`,
      ];
      const attempted = new Set([configured]);
      for (const fallback of WEIBO_HOT_FALLBACKS) {
        if (attempted.has(fallback.url)) continue;
        attempted.add(fallback.url);
        signal.throwIfAborted();
        try {
          const body = await fetchHotSourceText(fallback.url, {
            signal,
            referer: 'https://weibo.com/',
          });
          const candidates = parseHotTopicPayload(
            body,
            { ...fixedSource, url: fallback.url },
            fetchedAt,
          );
          if (!candidates.length)
            throw new HotTopicFetchError(
              'empty_weibo',
              '微博接口未返回可用的热搜榜单条目',
            );
          return {
            candidates,
            message: `${failures.join('；')}，已改用${fallback.label}`,
          };
        } catch (fallbackError) {
          signal.throwIfAborted();
          failures.push(
            `${fallback.label}失败（${safeHotTopicError(fallbackError)}）`,
          );
        }
      }
      throw new HotTopicFetchError('weibo_unavailable', failures.join('；'));
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
    const sources = (
      input.sources.length
        ? input.sources.filter((source) => source.isEnabled)
        : [DEFAULT_HOT_SOURCE]
    ).map((source) => {
      const fixedUrl = fixedHotSourceUrl(source.kind);
      return fixedUrl
        ? { ...source, url: fixedUrl, accessMode: 'page' as const }
        : source;
    });
    const searchSources = sources.filter(
      (source) => !fixedHotSourceUrl(source.kind),
    );
    const result: HotTopicFetchResult = {
      candidates: [],
      sources: [],
      searchExecuted: false,
      totalTokens: null,
    };
    const fetchedAt = new Date().toISOString();
    {
      for (const source of sources) {
        if (input.mode === 'aiSearch' && !fixedHotSourceUrl(source.kind))
          continue;
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
              `${platform.label}来源页面采集仅支持 ${platform.host} 官方域名`,
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
                : '来源没有返回符合分类要求的可用数据',
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
    if (input.mode !== 'platform' && searchSources.length) {
      input.signal.throwIfAborted();
      let searchDiagnostics: HotSearchDiagnostics | undefined;
      try {
        if (!input.config)
          throw new HotTopicFetchError(
            'missing_ai',
            'AI 联网模式需要选择热点发现 AI 配置',
          );
        const constraints = searchSources.map((source) => ({
          name: source.name,
          site: sourceHost(source),
          url: source.url,
        }));
        const search = await this.webSearch.search(
          input.config,
          `当前采集时间：${fetchedAt}。检索最近 ${input.preferences.lookbackHours} 小时的热点事件。\n` +
            `限定来源（只返回这些站点的原始网页）：${JSON.stringify(constraints)}\n` +
            `关注领域：${input.preferences.interests}；排除方向：${input.preferences.exclusions}。\n` +
            `最多 ${input.preferences.maxResults} 条。不得把搜索索引序号当热点排名。`,
          input.signal,
          (diagnostic) => {
            searchDiagnostics = diagnostic;
          },
        );
        result.searchExecuted = search.searchExecuted;
        result.totalTokens = search.totalTokens;
        // One verified search source is one candidate. Configuration scopes
        // results by the source domain; it no longer claims account ownership.
        for (const item of search.sources) {
          const matchedSources = searchSources.filter((source) =>
            matchesSource(item.url, source),
          );
          if (!matchedSources.length) continue;
          const host = new URL(item.url).hostname;
          const candidate: HotTopicCandidate = {
            ...item,
            sourceName: host.slice(0, 120),
            sourceId:
              matchedSources.length === 1 ? matchedSources[0].id || null : null,
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
        for (const source of searchSources) {
          const matches = search.sources.filter((item) =>
            matchesSource(item.url, source),
          );
          mergeSourceOutcome(
            result.sources,
            {
              sourceId: source.id || null,
              sourceName: source.name,
              status: matches.length ? 'succeeded' : 'failed',
              count: matches.length,
              ...(searchDiagnostics ? { searchDiagnostics } : {}),
              message: matches.length
                ? '仅收录供应商返回的真实搜索来源，时间和热度缺失时保持未知'
                : `没有返回该来源的可核验结果；未用其它网站代替${input.mode === 'aiSearch' && source.accessMode !== 'search' ? '。当前为仅 AI 联网模式，未直接读取配置页面' : ''}`,
            },
            'AI 联网',
          );
        }
      } catch (error) {
        input.signal.throwIfAborted();
        for (const source of searchSources)
          mergeSourceOutcome(
            result.sources,
            {
              sourceId: source.id || null,
              sourceName: source.name,
              status: 'failed',
              count: 0,
              message: safeHotTopicError(error),
              ...(searchDiagnostics ? { searchDiagnostics } : {}),
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
    compactHotSearchResponses(result.sources);
    return result;
  }
}
