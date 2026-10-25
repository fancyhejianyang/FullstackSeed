/** 仅接受错误封装中已完成的模型退役说明，不将不存在、维护或预下线视为退役。 */
export function isRetiredModelError(value: unknown, model: string): boolean {
  if (!model || model.length > 200 || /[\s*?]/.test(model)) return false;
  const escaped = model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const name = `["'\u0060“”‘’【】]?${escaped}["'\u0060“”‘’【】]?`;
  const english = new RegExp(
    `^(?:(?:the|this)\\s+)?(?:(?:requested|selected)\\s+)?model(?:\\s+${name})?\\s+(?:(?:has\\s+been|was)\\s+(?:permanently\\s+)?(?:retired|decommissioned|taken\\s+offline)|is\\s+permanently\\s+(?:retired|decommissioned))\\b`,
    'i',
  );
  const chinese = new RegExp(
    `^(?:所选|当前|该|此|请求的|您请求的|您所调用的)?模型(?:\\s*${name})?\\s*(?:已经|已)(?:永久)?(?:下线|退役|停止服务|停服)(?=$|[，。；,;.!\\s])`,
    'i',
  );
  const visited = new Set<object>();
  let retired = false;
  let uncertain = false;
  const inspect = (input: unknown, depth: number): void => {
    if (input == null) return;
    if (depth > 4) {
      uncertain = true;
      return;
    }
    if (typeof input === 'string') {
      if (input.length > 8192) {
        uncertain = true;
        return;
      }
      if (/^\s*\{/.test(input)) {
        try {
          inspect(JSON.parse(input) as unknown, depth + 1);
        } catch {
          uncertain = true;
        }
        return;
      }
      const message = input.replace(/\s+/g, ' ').trim();
      if (
        /\b(?:not|never|will|scheduled|maintenance|temporar\w*|discontinued)\b|预下线|即将|计划|尚未|并未|未下线|未退役|维护|恢复|停新购|[？?]/i.test(
          message,
        )
      )
        uncertain = true;
      if (english.test(message) || chinese.test(message)) retired = true;
      return;
    }
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      visited.has(input)
    )
      return;
    visited.add(input);
    const body = input as Record<string, unknown>;
    const modelStatus = body.status ?? body.model_status;
    // TokenHub 410001 是会话绑定的供应商下线，不能据此删除模型。
    if (
      [body.code, body.upstream_code].some(
        (code) => String(code) === '410001',
      ) ||
      (typeof modelStatus === 'string' &&
        ['pre-offline', 'maintenance', 'discontinued'].includes(modelStatus))
    )
      uncertain = true;
    for (const key of [
      'error',
      'message',
      'message_zh',
      'Message',
      'error_msg',
      'detail',
    ])
      inspect(body[key], depth + 1);
  };
  inspect(value, 0);
  return retired && !uncertain;
}
