export const AI_MATERIAL_GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

// 执行上限固定为 5 分钟，租约额外留出 30 秒用于落盘和事务提交，
// 防止其它服务实例在结果保存阶段提前回收任务。
export const AI_MATERIAL_TASK_LEASE_MS =
  AI_MATERIAL_GENERATION_TIMEOUT_MS + 30 * 1000;

export type MaterialGenerationPhase =
  | 'resolvingConfig'
  | 'readingReference'
  | 'requestingProvider'
  | 'parsingResponse'
  | 'downloadingImage'
  | 'storingImage'
  | 'attachingResult';

export class MaterialProviderHttpError extends Error {
  constructor(readonly statusCode: number) {
    super(`provider_http_${statusCode}`);
    this.name = 'MaterialProviderHttpError';
  }
}

type FailureContext = {
  phase: MaterialGenerationPhase;
  serviceStopped: boolean;
  manuallyAborted: boolean;
};

export function describeMaterialGenerationFailure(
  error: unknown,
  context: FailureContext,
): { status: 'failed' | 'interrupted'; message: string } {
  if (isVersionConflict(error)) {
    return {
      status: 'failed',
      message: '素材生成期间已被修改，新图未覆盖当前结果',
    };
  }
  if (context.serviceStopped || context.manuallyAborted) {
    return {
      status: 'interrupted',
      message:
        '服务停止导致生成中断；供应商可能仍在处理或计费，原素材未修改，系统不会自动重试',
    };
  }
  if (isTimeout(error)) {
    return {
      status: 'interrupted',
      message:
        '生成超时：已达到 5 分钟执行上限；供应商可能仍在处理或计费，原素材未修改，系统不会自动重试',
    };
  }
  if (error instanceof MaterialProviderHttpError) {
    return {
      status: 'failed',
      message: providerHttpMessage(error.statusCode),
    };
  }

  const knownMessage = applicationErrorMessage(error);
  const prefix: Record<MaterialGenerationPhase, string> = {
    resolvingConfig: '生图配置不可用',
    readingReference: '参考图片读取失败',
    requestingProvider: '无法连接生图服务',
    parsingResponse: '供应商响应无效',
    downloadingImage: '生成图片下载失败',
    storingImage: '图片已生成，但文件保存失败',
    attachingResult: '图片已生成，但结果写入失败',
  };
  return {
    status: 'failed',
    message: `${prefix[context.phase]}${knownMessage ? `：${knownMessage}` : ''}；原素材未修改，系统不会自动重试`,
  };
}

export function materialLeaseExpiredMessage() {
  return '任务已超过 5 分钟执行上限且后台租约过期；供应商可能仍在处理或计费，原素材未修改，系统不会自动重试';
}

function isVersionConflict(error: unknown) {
  return error instanceof Error && error.message === 'version_conflict';
}

function isTimeout(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; message?: unknown };
  const name = typeof candidate.name === 'string' ? candidate.name : '';
  const message =
    typeof candidate.message === 'string' ? candidate.message : '';
  return (
    name === 'TimeoutError' ||
    (name === 'AbortError' && /timeout|timed out|超时/i.test(message))
  );
}

function providerHttpMessage(statusCode: number) {
  if (statusCode === 400 || statusCode === 422) {
    return `供应商拒绝了生图参数（HTTP ${statusCode}），请检查模型、接口协议、参考图和提示词配置；原素材未修改，系统不会自动重试`;
  }
  if (statusCode === 401 || statusCode === 403) {
    return `供应商鉴权失败（HTTP ${statusCode}），请检查生图账号密钥、权限和服务状态；原素材未修改，系统不会自动重试`;
  }
  if (statusCode === 404) {
    return '生图接口或模型不存在（HTTP 404），请检查完整接口地址和模型编码；原素材未修改，系统不会自动重试';
  }
  if (statusCode === 408 || statusCode === 504) {
    return `供应商返回请求超时（HTTP ${statusCode}）；供应商可能仍在处理或计费，原素材未修改，系统不会自动重试`;
  }
  if (statusCode === 429) {
    return '供应商限流或额度不足（HTTP 429），请检查调用频率、并发、配额和余额；原素材未修改，系统不会自动重试';
  }
  if (statusCode >= 500) {
    return `供应商服务异常（HTTP ${statusCode}），请稍后检查服务状态；原素材未修改，系统不会自动重试`;
  }
  return `生图服务请求失败（HTTP ${statusCode}），请检查接口配置；原素材未修改，系统不会自动重试`;
}

function applicationErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return '';
  const message = error.message.trim();
  if (!message || /^fetch failed$/i.test(message)) return '';
  // 这里只保留本系统生成的简短错误，供应商响应体和密钥不会进入任务记录。
  return message.slice(0, 180);
}
