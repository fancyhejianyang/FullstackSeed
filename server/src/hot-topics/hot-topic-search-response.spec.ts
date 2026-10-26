import type { HotSearchDiagnostics } from '../knowledge-ai-providers/knowledge-web-search-diagnostics';
import type { HotSourceOutcome } from './hot-topic.types';
import {
  compactHotSearchResponses,
  hotSearchResponseForSource,
  HOT_SEARCH_DIAGNOSTIC_STORAGE_LIMIT,
} from './hot-topic-search-response';

const diagnostic = (): HotSearchDiagnostics => ({
  version: 1,
  providerId: 2,
  model: 'hy3',
  platformType: 'tencentTokenhub',
  protocol: 'openaiResponses',
  apiPath: '/v1/responses',
  httpStatus: 200,
  checkedAt: '2026-10-26T01:00:00.000Z',
  elapsedMilliseconds: 500,
  responseBody: '{"output":[{"type":"message"}]}',
  truncated: false,
  parsing: {
    status: 'failed',
    sourceCount: 0,
    code: 'search_unverified',
    message: '未返回搜索调用',
  },
});
const outcome = (
  searchDiagnostics?: HotSearchDiagnostics,
): HotSourceOutcome => ({
  sourceId: 1,
  sourceName: '抖音热点',
  status: 'failed',
  count: 0,
  message: '无法核验来源',
  ...(searchDiagnostics ? { searchDiagnostics } : {}),
});

describe('热点联网诊断存储', () => {
  it('同一次搜索仅保存一份响应，各来源能引用同一解析结果', () => {
    const response = diagnostic();
    const sources = [outcome(), outcome(response), outcome(response)];
    compactHotSearchResponses(sources);
    expect(sources[2]).not.toHaveProperty('searchDiagnostics');
    expect(sources[2].searchResponseSourceIndex).toBe(1);
    expect(hotSearchResponseForSource(sources, 2)).toEqual(response);
    expect(hotSearchResponseForSource(sources, 0)).toBeUndefined();
  });
  it('按 JSON 存储字节限制包含转义和中文的长响应，不破坏现有 TEXT 列', () => {
    const response = diagnostic();
    response.responseBody = '中文😀\\"\n'.repeat(15000);
    const sources = Array.from({ length: 5 }, () => outcome(response));
    compactHotSearchResponses(sources);
    const stored = hotSearchResponseForSource(sources, 4)!;
    expect(stored.truncated).toBe(true);
    expect(stored.responseBody).toContain('保存内容已截断');
    expect(Buffer.byteLength(JSON.stringify(stored))).toBeLessThanOrEqual(
      HOT_SEARCH_DIAGNOSTIC_STORAGE_LIMIT,
    );
    expect(Buffer.byteLength(JSON.stringify(sources))).toBeLessThan(65535);
    expect(stored.parsing).toEqual(response.parsing);
    expect(response.truncated).toBe(false);
  });
  it('不同响应分别保留，诊断总量共享同一个存储预算', () => {
    const responses = [diagnostic(), diagnostic()];
    for (const response of responses) response.responseBody = 'x'.repeat(50000);
    const sources = responses.map((response) => outcome(response));
    compactHotSearchResponses(sources);
    expect(sources[1]).not.toHaveProperty('searchResponseSourceIndex');
    expect(
      sources.reduce(
        (total, source) =>
          total + Buffer.byteLength(JSON.stringify(source.searchDiagnostics)),
        0,
      ),
    ).toBeLessThanOrEqual(HOT_SEARCH_DIAGNOSTIC_STORAGE_LIMIT);
  });
  it('历史空数据和无效引用不伪造响应，也不递归跟随引用链', () => {
    expect(hotSearchResponseForSource(null, 0)).toBeUndefined();
    for (const reference of [-1, 0, 99, 0.5, Number.NaN])
      expect(
        hotSearchResponseForSource(
          [{ ...outcome(), searchResponseSourceIndex: reference }],
          0,
        ),
      ).toBeUndefined();
    expect(
      hotSearchResponseForSource(
        [
          { ...outcome(), searchResponseSourceIndex: 1 },
          { ...outcome(), searchResponseSourceIndex: 2 },
          outcome(diagnostic()),
        ],
        0,
      ),
    ).toBeUndefined();
  });
});
