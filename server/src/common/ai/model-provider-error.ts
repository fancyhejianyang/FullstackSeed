export const MODEL_ACCOUNT_ARREARS_MESSAGE = '大模型账号已欠费，请充值后重试。';

/** 仅映射用户已确认的完整供应商报错，不把通用 AccessDenied/403 推断为欠费。 */
export function modelBillingErrorMessage(value: unknown): string | null {
  const visited = new Set<object>();
  const matches = (input: unknown, depth: number): boolean => {
    if (depth > 5) return false;
    if (typeof input === 'string') {
      // JSON 错误体只检查错误封装字段，不扫描正常回答、提示词或凭据字段。
      if (input.length <= 65536 && /^\s*\{/.test(input)) {
        try {
          return matches(JSON.parse(input) as unknown, depth + 1);
        } catch {
          /* 非 JSON 错误仍按文本识别。 */
        }
      }
      const text = input.slice(0, 8192).replace(/\s+/g, ' ');
      return (
        text.includes(MODEL_ACCOUNT_ARREARS_MESSAGE) ||
        /access to model denied\.\s*please make sure you are eligible for using the model\b/i.test(
          text,
        )
      );
    }
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      visited.has(input)
    )
      return false;
    visited.add(input);
    const body = input as Record<string, unknown>;
    return [
      'message',
      'Message',
      'error',
      'output',
      'data',
      'detail',
      'error_msg',
    ].some((key) => matches(body[key], depth + 1));
  };
  return matches(value, 0) ? MODEL_ACCOUNT_ARREARS_MESSAGE : null;
}

/** 错误响应最多读取 64 KB，支持 JSON/纯文本；无法读取时沿用调用方原有通用提示。 */
export async function readModelProviderError(
  response: Response,
): Promise<unknown> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 65536) return null;
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  } catch {
    return null;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
