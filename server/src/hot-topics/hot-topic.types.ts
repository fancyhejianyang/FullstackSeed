import type { HotSearchDiagnostics } from '../knowledge-ai-providers/knowledge-web-search-diagnostics';

/** 热点获取、推荐与前端 API 的公共契约；来源正文是资料，不是可执行指令。 */
export type HotSourceKind =
  | 'douyinHot'
  /** @deprecated 仅用于识别历史数据，新配置与任务不再接受账号绑定来源。 */
  | 'douyinAccount'
  | 'weiboHot'
  | 'neteaseNews';
export type ConfigurableHotSourceKind = Exclude<HotSourceKind, 'douyinAccount'>;
export const DOUYIN_HOT_URL =
  'https://www.douyin.com/aweme/v1/web/hot/search/list/';
export const NETEASE_NEWS_URL =
  'https://news.163.com/special/0001220O/new_json2021.js?0.20812515014162658';
export function fixedHotSourceUrl(kind: string): string | null {
  if (kind === 'douyinHot') return DOUYIN_HOT_URL;
  if (kind === 'neteaseNews') return NETEASE_NEWS_URL;
  return null;
}
export const CONFIGURABLE_HOT_SOURCE_KINDS = [
  'douyinHot',
  'weiboHot',
  'neteaseNews',
] as const;
export function isConfigurableHotSourceKind(
  value: string,
): value is ConfigurableHotSourceKind {
  return (CONFIGURABLE_HOT_SOURCE_KINDS as readonly string[]).includes(value);
}
/**
 * 平台类来源（公开页面 / AI 搜索）的展示名称与域名归属：
 * - 抖音与网易只读取系统固定接口；微博保留公开页面 / AI 搜索，允许合规聚合页；
 * 历史账号来源不再参与配置或任务执行。
 */
export const PLATFORM_SOURCES: Record<
  string,
  { host?: string; label: string }
> = {
  douyinHot: { label: '抖音', host: 'douyin.com' },
  weiboHot: { label: '微博' },
  neteaseNews: { label: '网易新闻', host: '163.com' },
};
export function platformSource(kind: string) {
  return PLATFORM_SOURCES[kind];
}
export function platformLabelForHost(host: string): string | null {
  for (const { host: base, label } of Object.values(PLATFORM_SOURCES))
    if (base && (host === base || host.endsWith(`.${base}`))) return label;
  return null;
}
export function isHostOf(host: string, base: string) {
  return host === base || host.endsWith(`.${base}`);
}
/** 热榜类来源；抖音固定接口，微博允许公网 HTTPS 聚合页。 */
export const HOT_LIST_KINDS = ['douyinHot', 'weiboHot'];
export type HotSourceAccess = 'page' | 'search';
export type HotTopicMode = 'aiSearch' | 'platform' | 'hybrid';
export type HotRunStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'interrupted';
export type HotTopicDecision = 'new' | 'ignored' | 'selected';
export interface HotSourceInput {
  id: number;
  name: string;
  kind: ConfigurableHotSourceKind;
  accessMode: HotSourceAccess;
  url: string;
  isEnabled: boolean;
  description: string;
}
export interface HotPreferenceInput {
  mode: HotTopicMode;
  aiConfigId: number | null;
  sourceIds: number[];
  interests: string;
  exclusions: string;
  audience: string;
  writingStyle: string;
  lookbackHours: number;
  maxResults: number;
  scheduleEnabled: boolean;
  scheduleTime: string;
}
export interface HotTopicCandidate {
  title: string;
  summary: string;
  url: string;
  sourceName: string;
  sourceId: number | null;
  platform: string;
  accountName: string | null;
  accountId: string | null;
  accountMatched: boolean;
  rank: number | null;
  heat: number | null;
  publishedAt: string | null;
  fetchedAt: string;
  acquisition: 'page' | 'feed' | 'aiSearch';
}
export interface HotSourceOutcome {
  sourceId: number | null;
  sourceName: string;
  status: 'succeeded' | 'failed' | 'skipped';
  count: number;
  message: string;
  /** 仅在任务来源 JSON 内保存；常规查询移除正文，点击详情时单独读取。 */
  searchDiagnostics?: HotSearchDiagnostics;
  /** 同一请求覆盖多个来源时，引用 sources 中保存该响应的来源下标。 */
  searchResponseSourceIndex?: number;
  /** 常规任务查询只返回是否存在诊断记录，兼容未采集响应的历史任务。 */
  hasSearchResponse?: boolean;
}
export interface HotTopicFetchResult {
  candidates: HotTopicCandidate[];
  sources: HotSourceOutcome[];
  searchExecuted: boolean;
  totalTokens: number | null;
}
export interface HotTopicAnalysis {
  index: number;
  recommendationLevel: 'high' | 'medium' | 'low';
  reason: string;
  suggestedAngles: string[];
  materialCompleteness: 'titleOnly' | 'summary';
}
