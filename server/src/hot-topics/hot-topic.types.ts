/** 热点获取、推荐与前端 API 的公共契约；来源正文是资料，不是可执行指令。 */
export type HotSourceKind =
  | 'douyinHot'
  /** @deprecated 仅用于识别历史数据，新配置与任务不再接受账号绑定来源。 */
  | 'douyinAccount'
  | 'weiboHot'
  | 'neteaseNews';
export type ConfigurableHotSourceKind = Exclude<HotSourceKind, 'douyinAccount'>;
export const NETEASE_NEWS_URL =
  'https://news.163.com/special/0001220O/new_json2021.js?0.20812515014162658';
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
 * - 热榜来源不限域名——既可以是平台自有页面，也可以是合规的第三方聚合页
 *   （如 tophub.today 的微博热搜榜），真实可用地址由使用者自行负责；
 * 历史账号来源不再参与配置或任务执行。
 */
export const PLATFORM_SOURCES: Record<
  string,
  { host?: string; label: string }
> = {
  douyinHot: { label: '抖音' },
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
/** 热榜类来源允许任意公网 HTTPS 页面（含聚合站）。 */
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
