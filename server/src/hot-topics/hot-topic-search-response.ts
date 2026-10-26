import type { HotSearchDiagnostics } from '../knowledge-ai-providers/knowledge-web-search-diagnostics';
import type { HotSourceOutcome } from './hot-topic.types';

// sources 使用现有 simple-json/TEXT 列；给诊断总量留界，余量用于来源说明和 JSON 转义。
export const HOT_SEARCH_DIAGNOSTIC_STORAGE_LIMIT = 24 * 1024;
const truncatedNotice = '\n[响应过长，保存内容已截断]';

function limitDiagnostic(value: HotSearchDiagnostics, byteLimit: number) {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') <= byteLimit)
    return value;
  const limited = { ...value, truncated: true, responseBody: '' };
  let lower = 0;
  let upper = value.responseBody.length;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    limited.responseBody =
      value.responseBody.slice(0, middle) + truncatedNotice;
    if (Buffer.byteLength(JSON.stringify(limited), 'utf8') <= byteLimit)
      lower = middle;
    else upper = middle - 1;
  }
  // 保持 UTF-16 字符边界，不把 emoji 的代理对截为半个字符。
  const last = value.responseBody.charCodeAt(lower - 1);
  if (last >= 0xd800 && last <= 0xdbff) lower -= 1;
  limited.responseBody = value.responseBody.slice(0, lower) + truncatedNotice;
  return limited;
}

/** 一个 AI 请求可覆盖多个来源，只保存一份响应，其余来源按原数组下标引用。 */
export function compactHotSearchResponses(sources: HotSourceOutcome[]) {
  const unique = new Set(
    sources.flatMap((source) =>
      source.searchDiagnostics ? [source.searchDiagnostics] : [],
    ),
  );
  const budget = Math.floor(
    HOT_SEARCH_DIAGNOSTIC_STORAGE_LIMIT / Math.max(1, unique.size),
  );
  const firstIndex = new Map<HotSearchDiagnostics, number>();
  sources.forEach((source, index) => {
    const diagnostic = source.searchDiagnostics;
    if (!diagnostic) return;
    const previous = firstIndex.get(diagnostic);
    if (previous === undefined) {
      firstIndex.set(diagnostic, index);
      source.searchDiagnostics = limitDiagnostic(diagnostic, budget);
    } else {
      delete source.searchDiagnostics;
      source.searchResponseSourceIndex = previous;
    }
  });
}

export function hotSearchResponseForSource(
  sources: HotSourceOutcome[] | null | undefined,
  index: number,
): HotSearchDiagnostics | undefined {
  const source = sources?.[index];
  if (source?.searchDiagnostics) return source.searchDiagnostics;
  const reference = source?.searchResponseSourceIndex;
  if (
    typeof reference !== 'number' ||
    !Number.isSafeInteger(reference) ||
    reference < 0 ||
    reference === index
  )
    return undefined;
  return sources?.[reference]?.searchDiagnostics;
}
