import request from '@/utils/request';

export type HotSourceKind = 'douyinHot' | 'neteaseNews';
export const NETEASE_NEWS_API_URL =
  'https://news.163.com/special/0001220O/new_json2021.js?0.20812515014162658';
export type HotRunStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'interrupted';
export type HotTopicDecision = 'new' | 'ignored' | 'selected';
export interface HotSourceForm {
  name: string;
  kind: HotSourceKind;
  url: string;
  isEnabled: boolean;
  description: string;
}
export interface HotSource extends HotSourceForm {
  id: number;
  createdAt: string;
  updatedAt: string;
}
export interface HotPreference {
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
export interface HotTopic extends HotTopicCandidate {
  id: number;
  title: string;
  summary: string;
  recommendationLevel: 'unreviewed' | 'high' | 'medium' | 'low';
  reason: string;
  suggestedAngles: string[];
  materialCompleteness: 'titleOnly' | 'summary';
  decision: HotTopicDecision;
  articleId: number | null;
  candidates: HotTopicCandidate[];
  createdAt: string;
  updatedAt: string;
}
export type HotTopicSummary = Pick<
  HotTopic,
  | 'id'
  | 'title'
  | 'sourceName'
  | 'rank'
  | 'recommendationLevel'
  | 'reason'
  | 'decision'
  | 'fetchedAt'
  | 'articleId'
>;
export interface HotSourceOutcome {
  sourceId: number | null;
  sourceName: string;
  status: 'succeeded' | 'failed' | 'skipped';
  count: number;
  message: string;
}
export interface HotRun {
  id: number;
  status: HotRunStatus;
  action: 'discover' | 'recommend';
  trigger: 'manual' | 'schedule';
  stage: string;
  message: string;
  searchExecuted: boolean;
  candidateCount: number;
  topicCount: number;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  totalTokens: number | null;
  sources: HotSourceOutcome[] | null;
}
export interface HotOptions {
  sources: Pick<
    HotSource,
    'id' | 'name' | 'kind' | 'url' | 'isEnabled' | 'description'
  >[];
  aiConfigs: {
    id: number;
    name: string;
    model: string | null;
  }[];
}
export const sourceKindLabels: Record<HotSourceKind, string> = {
  douyinHot: '抖音热点',
  neteaseNews: '网易国内新闻',
};
export const decisionLabels: Record<HotTopicDecision, string> = {
  new: '未处理',
  ignored: '已忽略',
  selected: '已选题创作',
};
export const levelLabels = {
  unreviewed: '未 AI 推荐',
  high: '优先推荐',
  medium: '可以考虑',
  low: '暂不优先',
};
export const runStatusLabels: Record<HotRunStatus, string> = {
  pending: '待执行',
  running: '执行中',
  succeeded: '完成',
  partial: '部分完成',
  failed: '失败',
  interrupted: '已中断',
};
export const activeRun = (status: HotRunStatus) =>
  status === 'pending' || status === 'running';
export function safeSourceUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : '';
  } catch {
    return '';
  }
}
type Page<T> = { list: T[]; total: number };
type Query = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  decision?: HotTopicDecision | 'all';
  level?: string;
};
export const getHotSources = (params: Query) =>
  request.get<unknown, Page<HotSource>>('/hot-topic-sources', { params });
export const getHotSource = (id: number) =>
  request.get<unknown, HotSource>(`/hot-topic-sources/${id}`);
export const createHotSource = (data: HotSourceForm) =>
  request.post('/hot-topic-sources', data);
export const updateHotSource = (id: number, data: HotSourceForm) =>
  request.patch(`/hot-topic-sources/${id}`, data);
export const deleteHotSource = (id: number) =>
  request.delete(`/hot-topic-sources/${id}`);
export const batchDeleteHotSources = (ids: Array<string | number>) =>
  request.post('/hot-topic-sources/batch-delete', { ids: ids.map(Number) });
export const getHotTopics = (params: Query) =>
  request.get<unknown, Page<HotTopicSummary>>('/hot-topics', { params });
export const getHotTopic = (id: number) =>
  request.get<unknown, HotTopic>(`/hot-topics/${id}`);
export const getHotPreference = () =>
  request.get<unknown, HotPreference>('/hot-topics/preferences');
export const saveHotPreference = (data: HotPreference) =>
  request.put<unknown, HotPreference>('/hot-topics/preferences', data);
export const getHotOptions = () =>
  request.get<unknown, HotOptions>('/hot-topics/options');
export const startHotRun = (data: {
  requestId: string;
  action: 'discover' | 'recommend';
}) => request.post<unknown, HotRun>('/hot-topics/runs', data);
export const getHotRuns = (params: Query, silentError = false) =>
  request.get<unknown, Page<HotRun>>('/hot-topics/runs', {
    params,
    silentError,
  });
export const getHotRun = (id: number, silentError = false) =>
  request.get<unknown, HotRun>(`/hot-topics/runs/${id}`, { silentError });
export const updateHotDecision = (
  id: number,
  decision: Exclude<HotTopicDecision, 'selected'>,
) => request.patch(`/hot-topics/${id}/decision`, { decision });
export const createHotArticle = (
  id: number,
  data: {
    requestId: string;
    idea: string;
    aiConfigId?: number;
    templateId?: number;
    generate: boolean;
  },
) =>
  request.post<unknown, { id: number; taskId?: number }>(
    `/hot-topics/${id}/create-article`,
    data,
  );
