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

export const HOT_SEARCH_RESPONSE_LIMIT_BYTES = 64 * 1024;

const hidden = '[已隐藏]';
const omitted = '[内容已截断]';
const sensitiveField = (name: string) => {
  const field = name.replace(/[^a-z0-9]/gi, '');
  return (
    /authorization|headers|cookie|apikey|secret|accesskey|accesstoken|refreshtoken|password|credential/i.test(
      field,
    ) ||
    /^(?:key|token|request|requestbody|requestpayload|requestparams|requestparameters|prompt|prompts|instructions|messages|input|query|queries|searchquery)$/i.test(
      field,
    )
  );
};

/** 仅供查看响应结构；来源正文不可信，凭据及请求回显先脱敏再作有界展示。 */
export function sanitizeHotSearchResponse(
  input: unknown,
  protectedValues: readonly string[] = [],
): { responseBody: string; truncated: boolean } {
  let truncated = false;
  let nodes = 0;
  const secrets = protectedValues
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const text = (value: string): string => {
    let safe = value;
    for (const secret of secrets) safe = safe.split(secret).join(hidden);
    safe = safe
      .replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer [已隐藏]')
      .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, hidden)
      .replace(
        /\b(authorization|api[_-]?key|secret[_-]?key|access[_-]?token|password)\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;<>]+)/gi,
        '$1: [已隐藏]',
      )
      .replace(/https?:\/\/[^\s"'<>\\]+/gi, (raw) => {
        try {
          const url = new URL(raw);
          const hadPrivateParts = !!(
            url.username ||
            url.password ||
            url.search ||
            url.hash
          );
          url.username = '';
          url.password = '';
          url.search = '';
          url.hash = '';
          return url.toString() + (hadPrivateParts ? '[凭据或查询已隐藏]' : '');
        } catch {
          return '[地址已隐藏]';
        }
      })
      .replace(
        /data:[^\s"'<>;,]+(?:;[^\s"'<>;,]+)*;base64,[A-Za-z0-9+/=]+/gi,
        () => {
          truncated = true;
          return '[Base64 内容已省略]';
        },
      );
    if (/^[A-Za-z0-9+/]{512,}={0,2}$/.test(safe)) {
      truncated = true;
      return '[Base64 内容已省略]';
    }
    if (safe.length > 8192) {
      truncated = true;
      return safe.slice(0, 8192) + omitted;
    }
    return safe;
  };
  const visited = new Set<object>();
  const clean = (value: unknown, depth: number): unknown => {
    if (++nodes > 2000 || depth > 12) {
      truncated = true;
      return omitted;
    }
    if (typeof value === 'string') return text(value);
    if (!value || typeof value !== 'object') return value;
    if (visited.has(value)) {
      truncated = true;
      return omitted;
    }
    visited.add(value);
    if (Array.isArray(value)) {
      const result = value.slice(0, 100).map((item) => clean(item, depth + 1));
      if (value.length > 100) {
        truncated = true;
        result.push(omitted);
      }
      return result;
    }
    const entries = Object.entries(value);
    const result: Record<string, unknown> = {};
    for (const [key, item] of entries.slice(0, 100)) {
      const safeKey = text(key);
      if (sensitiveField(key)) result[safeKey] = hidden;
      else if (/^(?:b64_json|base64|embedding|embeddings)$/i.test(key)) {
        result[safeKey] = '[大字段已省略]';
        truncated = true;
      } else result[safeKey] = clean(item, depth + 1);
    }
    if (entries.length > 100) {
      truncated = true;
      result['[其余字段]'] = omitted;
    }
    return result;
  };
  let value = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input) as unknown;
    } catch {
      // 非 JSON 响应保留脱敏文本，用于检查网关错误或不兼容返回。
    }
  }
  const safe = clean(value, 0);
  let responseBody =
    typeof safe === 'string' ? safe : (JSON.stringify(safe, null, 2) ?? '');
  if (
    Buffer.byteLength(responseBody, 'utf8') > HOT_SEARCH_RESPONSE_LIMIT_BYTES
  ) {
    const marker = '\n[响应已截断]';
    const limit = HOT_SEARCH_RESPONSE_LIMIT_BYTES - Buffer.byteLength(marker);
    responseBody = Buffer.from(responseBody)
      .subarray(0, limit)
      .toString('utf8');
    while (Buffer.byteLength(responseBody) > limit)
      responseBody = responseBody.slice(0, -1);
    responseBody += marker;
    truncated = true;
  }
  return { responseBody, truncated };
}
