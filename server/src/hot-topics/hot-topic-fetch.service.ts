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
import type {
  HotPreferenceInput,
  HotSourceInput,
  HotTopicCandidate,
  HotTopicFetchResult,
  HotTopicMode,
} from './hot-topic.types';

function sourceHost(source: HotSourceInput): string | null {
  if (source.kind.startsWith('douyin')) return 'douyin.com';
  const url = normalizeHotTopicLink(source.url);
  return url ? new URL(url).hostname.replace(/^www\./, '') : null;
}
function matchesSource(url: string, source: HotSourceInput) {
  const host = sourceHost(source);
  const actual = new URL(url).hostname;
  return Boolean(host && (actual === host || actual.endsWith(`.${host}`)));
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
          if (
            source.kind.startsWith('douyin') &&
            source.accessMode === 'page' &&
            !matchesSource(source.url, source)
          )
            throw new HotTopicFetchError(
              'invalid_platform',
              '抖音页面采集仅支持 douyin.com 官方域名',
            );
          const body = await fetchHotSourceText(source.url, {
            signal: input.signal,
            bearerToken:
              source.accessMode === 'feed' && source.kind === 'jsonFeed'
                ? source.apiToken
                : undefined,
          });
          const candidates = parseHotTopicPayload(body, source, fetchedAt);
          result.candidates.push(...candidates);
          result.sources.push({
            sourceId: source.id || null,
            sourceName: source.name,
            status: candidates.length ? 'succeeded' : 'failed',
            count: candidates.length,
            message: candidates.length
              ? '已读取来源公开结构化数据'
              : '来源没有返回可用且符合账号约束的数据',
          });
        } catch (error) {
          input.signal.throwIfAborted();
          result.sources.push({
            sourceId: source.id || null,
            sourceName: source.name,
            status: 'failed',
            count: 0,
            message: safeHotTopicError(error),
          });
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
        // One search result is one candidate, not one candidate per account query.
        // A domain match never proves which account authored a result.
        for (const item of search.sources) {
          const matchedSources = sources.filter((source) =>
            matchesSource(item.url, source),
          );
          if (!matchedSources.length) continue;
          const unscoped = matchedSources.filter(
            (source) => source.kind !== 'douyinAccount' && !source.accountId,
          );
          const host = new URL(item.url).hostname;
          const candidate: HotTopicCandidate = {
            ...item,
            sourceName: host.slice(0, 120),
            sourceId: unscoped.length === 1 ? unscoped[0].id || null : null,
            platform:
              host === 'douyin.com' || host.endsWith('.douyin.com')
                ? '抖音'
                : host.slice(0, 40),
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
          result.sources.push({
            sourceId: source.id || null,
            sourceName: source.name,
            status: matches.length
              ? accountRestricted
                ? 'skipped'
                : 'succeeded'
              : 'failed',
            count: accountRestricted ? 0 : matches.length,
            message: matches.length
              ? accountRestricted
                ? 'AI 已联网找到本站相关资料，但未验证账号 UID；不代表已抓取指定作者作品，候选仅以实际来源域名展示且未关联该账号'
                : 'AI 已联网；仅收录供应商真实搜索来源，时间和热度缺失时保持未知'
              : 'AI 已执行搜索，但没有返回该站点的可核验来源；未用其它网站代替',
          });
        }
      } catch (error) {
        input.signal.throwIfAborted();
        for (const source of sources)
          result.sources.push({
            sourceId: source.id || null,
            sourceName: source.name,
            status: 'failed',
            count: 0,
            message: safeHotTopicError(error),
          });
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
