export const MODEL_ACCOUNT_ARREARS_MESSAGE = '大模型账号已欠费，请充值后重试。';
export const MODEL_SERVICE_NO_FREE_QUOTA_MESSAGE =
  '该服务暂无免费额度，且未开启按量付费，请开通后重试。';

/** 仅映射已确认的完整计费报错，不根据通用 AccessDenied/402/403 推断原因。 */
export function modelBillingErrorMessage(value: unknown): string | null {
  const visited = new Set<object>();
  const findMessage = (input: unknown, depth: number): string | null => {
    if (depth > 5) return null;
    if (typeof input === 'string') {
      // JSON 错误体只检查错误封装字段，不扫描正常回答、提示词或凭据字段。
      if (input.length <= 65536 && /^\s*\{/.test(input)) {
        try {
          return findMessage(JSON.parse(input) as unknown, depth + 1);
        } catch {
          /* 非 JSON 错误仍按文本识别。 */
        }
      }
      const text = input.slice(0, 8192).replace(/\s+/g, ' ');
      if (
        text.includes(MODEL_ACCOUNT_ARREARS_MESSAGE) ||
        /access to model denied\.\s*please make sure you are eligible for using the model\b/i.test(
          text,
        )
      )
        return MODEL_ACCOUNT_ARREARS_MESSAGE;
      if (
        text.includes(MODEL_SERVICE_NO_FREE_QUOTA_MESSAGE) ||
        /\bno free trial quota is available for the service and postpaid billing is not enabled\b/i.test(
          text,
        )
      )
        return MODEL_SERVICE_NO_FREE_QUOTA_MESSAGE;
      return null;
    }
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      visited.has(input)
    )
      return null;
    visited.add(input);
    const body = input as Record<string, unknown>;
    for (const key of [
      'message',
      'Message',
      'error',
      'output',
      'data',
      'detail',
      'error_msg',
    ]) {
      const message = findMessage(body[key], depth + 1);
      if (message) return message;
    }
    return null;
  };
  return findMessage(value, 0);
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
