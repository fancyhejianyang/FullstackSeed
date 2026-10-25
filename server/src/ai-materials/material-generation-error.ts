import type { AiMaterialMediaType } from './ai-material.constants';
import { modelBillingErrorMessage } from '../common/ai/model-provider-error';

export const AI_MATERIAL_IMAGE_TIMEOUT_MS = 5 * 60 * 1000;
export const AI_MATERIAL_VIDEO_TIMEOUT_MS = 15 * 60 * 1000;

// 图片执行上限 5 分钟，视频执行上限 15 分钟；租约额外留出 1 分钟用于落盘和事务提交。
export function materialGenerationTimeout(mediaType: AiMaterialMediaType) {
  return mediaType === 'video'
    ? AI_MATERIAL_VIDEO_TIMEOUT_MS
    : AI_MATERIAL_IMAGE_TIMEOUT_MS;
}

export function materialTaskLease(mediaType: AiMaterialMediaType) {
  return materialGenerationTimeout(mediaType) + 60 * 1000;
}

export type MaterialGenerationPhase =
  | 'resolvingConfig'
  | 'readingReference'
  | 'requestingProvider'
  | 'pollingProvider'
  | 'parsingResponse'
  | 'downloadingImage'
  | 'downloadingVideo'
  | 'storingImage'
  | 'storingVideo'
  | 'attachingResult';

export class MaterialProviderHttpError extends Error {
  readonly providerCode: string;
  readonly providerMessage: string;
  readonly billingMessage: string | null;

  constructor(
    readonly statusCode: number,
    providerResponse?: unknown,
  ) {
    super(`provider_http_${statusCode}`);
    this.name = 'MaterialProviderHttpError';
    this.billingMessage = modelBillingErrorMessage(providerResponse);
    const details = providerErrorDetails(providerResponse);
    this.providerCode = details.code;
    this.providerMessage = details.message;
  }
}

type FailureContext = {
  phase: MaterialGenerationPhase;
  mediaType: AiMaterialMediaType;
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
      message: '素材生成期间已被修改，新结果未覆盖当前素材',
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
    const minutes = materialGenerationTimeout(context.mediaType) / 60000;
    return {
      status: 'interrupted',
      message: `生成超时：已达到 ${minutes} 分钟执行上限；供应商可能仍在处理或计费，原素材未修改，系统不会自动重试`,
    };
  }
  const billingMessage =
    error instanceof MaterialProviderHttpError
      ? error.billingMessage
      : modelBillingErrorMessage(
          error instanceof Error ? error.message : error,
        );
  if (billingMessage) return { status: 'failed', message: billingMessage };
  if (error instanceof MaterialProviderHttpError) {
    if (context.mediaType === 'video' && providerRejectsAsyncCall(error)) {
      return {
        status: 'failed',
        message:
          '供应商拒绝异步视频协议；请确认视频接口路径为 /api/v1/services/aigc/video-generation/video-synthesis，并确保模型、API Key、Workspace 属于同一地域。万相视频接口只支持异步调用，系统不会改用同步请求或自动重试',
      };
    }
    return {
      status: 'failed',
      message: providerHttpMessage(
        error.statusCode,
        error.providerCode,
        error.providerMessage,
      ),
    };
  }

  const knownMessage = applicationErrorMessage(error);
  const prefix: Record<MaterialGenerationPhase, string> = {
    resolvingConfig: '生成配置不可用',
    readingReference: '参考图片读取失败',
    requestingProvider: '无法连接生成服务',
    pollingProvider: '视频任务状态查询失败',
    parsingResponse: '供应商响应无效',
    downloadingImage: '生成图片下载失败',
    downloadingVideo: '生成视频下载失败',
    storingImage: '图片已生成，但文件保存失败',
    storingVideo: '视频已生成，但文件保存失败',
    attachingResult: '媒体文件已生成，但结果写入失败',
  };
  return {
    status: 'failed',
    message: `${prefix[context.phase]}${knownMessage ? `：${knownMessage}` : ''}；原素材未修改，系统不会自动重试`,
  };
}

function providerRejectsAsyncCall(error: MaterialProviderHttpError) {
  return (
    error.statusCode === 403 &&
    /current user api does not support asynchronous calls/i.test(
      error.providerMessage,
    )
  );
}

export function materialLeaseExpiredMessage(mediaType: AiMaterialMediaType) {
  const minutes = materialGenerationTimeout(mediaType) / 60000;
  return `任务已超过 ${minutes} 分钟执行上限且后台租约过期；供应商可能仍在处理或计费，原素材未修改，系统不会自动重试`;
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

function providerHttpMessage(
  statusCode: number,
  providerCode = '',
  providerMessage = '',
) {
  const providerDetail = [providerCode, providerMessage]
    .filter(Boolean)
    .join('：');
  const detail = providerDetail ? `，供应商返回：${providerDetail}` : '';
  if (statusCode === 400 || statusCode === 422) {
    return `供应商拒绝了生成参数（HTTP ${statusCode}）${detail}，请检查模型、接口协议、参考图和提示词配置；原素材未修改，系统不会自动重试`;
  }
  if (statusCode === 401 || statusCode === 403) {
    return `供应商鉴权失败（HTTP ${statusCode}）${detail}，请检查模型账号密钥、权限和服务状态；原素材未修改，系统不会自动重试`;
  }
  if (statusCode === 404) {
    return `生成接口或模型不存在（HTTP 404）${detail}，请检查完整接口地址和模型编码；原素材未修改，系统不会自动重试`;
  }
  if (statusCode === 408 || statusCode === 504) {
    return `供应商返回请求超时（HTTP ${statusCode}）；供应商可能仍在处理或计费，原素材未修改，系统不会自动重试`;
  }
  if (statusCode === 429) {
    return `供应商限流或额度不足（HTTP 429）${detail}，请检查调用频率、并发、配额和余额；原素材未修改，系统不会自动重试`;
  }
  if (statusCode >= 500) {
    return `供应商服务异常（HTTP ${statusCode}）${detail}，请稍后检查服务状态；原素材未修改，系统不会自动重试`;
  }
  return `生成服务请求失败（HTTP ${statusCode}）${detail}，请检查接口配置；原素材未修改，系统不会自动重试`;
}

function providerErrorDetails(value: unknown) {
  const body = record(value);
  const output = record(body.output);
  return {
    code: safeProviderText(output.code ?? body.code, 80, true),
    message: safeProviderText(output.message ?? body.message, 180),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeProviderText(value: unknown, limit: number, codeOnly = false) {
  if (typeof value !== 'string') return '';
  const sanitized = value
    .replace(/Bearer\s+\S+/gi, 'Bearer [已隐藏]')
    .replace(/\bsk-[a-z0-9_-]+\b/gi, '[已隐藏密钥]')
    .replace(/https?:\/\/\S+/gi, '[已隐藏地址]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
  if (codeOnly && !/^[a-z0-9_.:-]+$/i.test(sanitized)) return '';
  return sanitized.slice(0, limit);
}

function applicationErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return '';
  const message = error.message.trim();
  if (!message || /^fetch failed$/i.test(message)) return '';
  // 这里只保留本系统生成的简短错误，供应商响应体和密钥不会进入任务记录。
  return message.slice(0, 180);
}
