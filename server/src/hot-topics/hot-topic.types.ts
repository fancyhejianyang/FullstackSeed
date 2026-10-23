/** 热点获取、推荐与前端 API 的公共契约；来源正文是资料，不是可执行指令。 */
export type HotSourceKind =
  | 'douyinHot'
  | 'douyinAccount'
  | 'weiboHot'
  | 'rss'
  | 'jsonFeed';
/**
 * 平台类来源（公开页面 / AI 搜索）的归属域名与展示名称；其它来源按自身 URL 匹配。
 * 域名是白名单而非提示：非官方域名不得冒充平台来源。
 */
export const PLATFORM_SOURCES: Record<string, { host: string; label: string }> =
  {
    douyinHot: { host: 'douyin.com', label: '抖音' },
    douyinAccount: { host: 'douyin.com', label: '抖音' },
    weiboHot: { host: 'weibo.com', label: '微博' },
  };
export function platformSource(kind: string) {
  return PLATFORM_SOURCES[kind];
}
export function platformLabelForHost(host: string): string | null {
  for (const { host: base, label } of Object.values(PLATFORM_SOURCES))
    if (host === base || host.endsWith(`.${base}`)) return label;
  return null;
}
export function isHostOf(host: string, base: string) {
  return host === base || host.endsWith(`.${base}`);
}
export type HotSourceAccess = 'page' | 'search' | 'feed';
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
  kind: HotSourceKind;
  accessMode: HotSourceAccess;
  url: string;
  accountName: string;
  accountId: string;
  isEnabled: boolean;
  description: string;
  /** 仅用于授权 JSON Feed 的 Bearer Token，不得进入任务/日志快照。 */
  apiToken?: string | null;
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
