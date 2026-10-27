import { modelBillingErrorMessage } from '../common/ai/model-provider-error';

/** 仅输出固定分类文案，禁止持久化供应商原始错误中的响应体、地址或凭据。 */
export function contentGenerationErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : error;
  const billing = modelBillingErrorMessage(message);
  if (billing) return billing;
  const text = typeof message === 'string' ? message : '';
  // 只提取 callChat 生成的 HTTP 状态前缀，不把响应体/URL 内的数字当状态码。
  const status = Number(/^模型接口调用失败：(\d{3})(?:\s|$)/.exec(text)?.[1]);
  let reason = '模型调用失败，请检查账号、模型配置或服务连接';
  if (status === 401) reason = '模型服务鉴权失败（HTTP 401），请检查账号密钥';
  else if (status === 403)
    reason = '模型服务拒绝访问（HTTP 403），请检查账号及模型访问权限';
  else if (status === 404)
    reason = '模型接口或模型不可用（HTTP 404），请检查模型和接口配置';
  else if (status === 429)
    reason = '模型服务限流或配额受限（HTTP 429），请检查额度或稍后重试';
  else if (status === 408 || status === 504)
    reason = `模型服务响应超时（HTTP ${status}）`;
  else if (status >= 500 && status <= 599)
    reason = `模型服务暂时异常（HTTP ${status}），请稍后重试`;
  else if (status >= 400 && status <= 499)
    reason = `模型服务拒绝请求（HTTP ${status}），请检查模型及请求参数`;
  else if (/timeout|timed out|超时/i.test(text))
    reason = '模型服务响应超时，请检查服务连接或稍后重试';
  else if (
    /fetch failed|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(text)
  )
    reason = '模型服务连接失败，请检查网络或服务地址';
  else if (text === '模型接口响应缺少 choices[0].message.content')
    reason = '模型未返回正文内容，请检查模型是否支持文本生成';
  else if (error instanceof SyntaxError)
    reason = '模型服务返回了无效响应，请检查接口配置';
  return `${reason}；原文未修改，供应商可能已计费，不会自动重试。`;
}
