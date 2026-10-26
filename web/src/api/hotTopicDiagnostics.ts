import request from '@/utils/request';
import type { HotRun, HotSourceOutcome } from '@/api/hotTopic';

export interface HotSearchDiagnostics {
  version: 1;
  providerId: number;
  model: string;
  platformType: string;
  protocol: string;
  apiPath: string;
  httpStatus: number | null;
  checkedAt: string;
  elapsedMilliseconds: number;
  responseBody: string;
  truncated: boolean;
  parsing: {
    status: 'succeeded' | 'failed' | 'notAttempted';
    sourceCount: number;
    code: string | null;
    message: string;
  };
}

export type HotRunWithSearchResponses = Omit<HotRun, 'sources'> & {
  sources: (HotSourceOutcome & { hasSearchResponse?: boolean })[] | null;
};

/** 只读取已保存的联网响应，不能重新发起模型调用。 */
export function getHotRunSearchResponse(runId: number, sourceIndex: number) {
  return request.get<unknown, HotSearchDiagnostics>(
    `/hot-topics/runs/${runId}/search-response/${sourceIndex}`,
    { silentError: true },
  );
}
