/** 热点获取、推荐与前端 API 的公共契约；来源正文是资料，不是可执行指令。 */
export type HotSourceKind = 'douyinHot' | 'douyinAccount' | 'rss' | 'jsonFeed';
export type HotSourceAccess = 'page' | 'search' | 'feed';
export type HotTopicMode = 'aiSearch' | 'platform' | 'hybrid';
export type HotRunStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'interrupted';
export type HotTopicDecision = 'new' | 'saved' | 'ignored' | 'selected';
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
