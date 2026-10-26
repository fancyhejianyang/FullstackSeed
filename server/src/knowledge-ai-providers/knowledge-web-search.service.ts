import { HttpException, Injectable } from '@nestjs/common';
import type { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import {
  KnowledgeAiProvidersService,
  type KnowledgeAiWebSearchTarget,
} from './knowledge-ai-providers.service';
import { HotTopicFetchError } from '../hot-topics/hot-topic-network';
import {
  buildVerifiedSearchRequest,
  parseTokenhubSearchResponse,
  parseVerifiedSearchResponse,
  type VerifiedSearchResult,
} from './knowledge-web-search.utils';
import { modelBillingErrorMessage } from '../common/ai/model-provider-error';
import { detectModelPlatform } from '../model-endpoints/model-endpoint.constants';
import {
  sanitizeHotSearchResponse,
  type HotSearchDiagnostics,
} from './knowledge-web-search-diagnostics';

export {
  bailianResponsesUrl,
  parseVerifiedSearchResponse,
} from './knowledge-web-search.utils';
export type {
  VerifiedSearchSource,
  VerifiedSearchResult,
} from './knowledge-web-search.utils';

async function readLimitedText(
  response: Response,
  byteLimit: number,
  capture: (text: string, truncated: boolean) => void,
): Promise<string> {
  if (!response.body) {
    capture('', false);
    return '';
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let complete = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > byteLimit) {
        chunks.push(value.subarray(0, byteLimit - (size - value.length)));
        throw new HotTopicFetchError(
          'search_large',
          'AI 联网响应超过 3 MB 限制',
        );
      }
      chunks.push(value);
    }
    complete = true;
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    capture(Buffer.concat(chunks).toString('utf8'), !complete);
    await reader.cancel().catch(() => undefined);
  }
}

async function readLimitedJson(
  response: Response,
  capture: (text: string, truncated: boolean) => void,
): Promise<unknown> {
  if (!response.body) {
    capture('', false);
    throw new HotTopicFetchError('search_empty', 'AI 联网返回空响应');
  }
  const text = await readLimitedText(response, 3 * 1024 * 1024, capture);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HotTopicFetchError(
      'search_format',
      'AI 联网返回的数据格式不受支持',
    );
  }
}

@Injectable()
export class KnowledgeWebSearchService {
  constructor(private readonly providers: KnowledgeAiProvidersService) {}

  async search(
    config: AiFeatureConfig,
    query: string,
    signal: AbortSignal,
    onDiagnostics?: (diagnostics: HotSearchDiagnostics) => void,
  ): Promise<VerifiedSearchResult> {
    if (
      !config.isEnabled ||
      config.featureType !== 'topicDiscovery' ||
      !config.providerId ||
      !config.model
    )
      throw new HotTopicFetchError(
        'search_config',
        '请选择已启用且配置完整的热点发现 AI 配置',
      );
    signal.throwIfAborted();
    let target: KnowledgeAiWebSearchTarget;
    try {
      target = await this.providers.resolveWebSearchTarget({
        id: config.providerId,
        model: config.model,
      });
    } catch (error) {
      if (error instanceof HotTopicFetchError) throw error;
      throw new HotTopicFetchError(
        'search_config',
        error instanceof HttpException
          ? error.message
          : '系统自动联网补充不可用，请检查账号及模型服务',
      );
    }
    signal.throwIfAborted();
    const boundedSignal = AbortSignal.any([
      signal,
      AbortSignal.timeout(120000),
    ]);
    const startedAt = Date.now();
    let httpStatus: number | null = null;
    let responseText = '';
    let responseTruncated = false;
    const parsing: HotSearchDiagnostics['parsing'] = {
      status: 'notAttempted',
      sourceCount: 0,
      code: null,
      message: '尚未取得可解析的联网响应',
    };
    const capture = (text: string, truncated: boolean) => {
      responseText = text;
      responseTruncated = truncated;
    };
    try {
      const response = await fetch(target.url, {
        method: 'POST',
        redirect: 'error',
        signal: boundedSignal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + target.secretKey,
        },
        body: JSON.stringify(
          buildVerifiedSearchRequest({
            webSearchMode: target.webSearchMode,
            protocol: target.protocol,
            model: target.model,
            query,
            enableThinking: config.enableThinking,
          }),
        ),
      });
      httpStatus = response.status;
      if (!response.ok) {
        let errorValue: unknown = null;
        try {
          const text = await readLimitedText(response, 65536, capture);
          try {
            errorValue = JSON.parse(text) as unknown;
          } catch {
            errorValue = text;
          }
        } catch {
          // 与原错误读取保持一致：读取失败或超限时仍返回当前 HTTP 的受控错误。
        }
        const billing = modelBillingErrorMessage(errorValue);
        if (billing) throw new HotTopicFetchError('search_billing', billing);
        const reason = [401, 403].includes(response.status)
          ? '账号鉴权失败'
          : response.status === 429
            ? '供应商限流'
            : response.status === 400
              ? '模型或联网协议不受支持，请检查配置'
              : '供应商服务异常';
        throw new HotTopicFetchError(
          'search_http',
          'AI 联网失败：' +
            reason +
            '（HTTP ' +
            response.status +
            '）；可能已计费，未自动重试',
        );
      }
      const value = await readLimitedJson(response, capture);
      const billing = modelBillingErrorMessage(value);
      if (billing) throw new HotTopicFetchError('search_billing', billing);
      parsing.status = 'failed';
      const result =
        target.webSearchMode === 'tokenhubSearch'
          ? parseTokenhubSearchResponse(value, target.protocol)
          : parseVerifiedSearchResponse(value);
      parsing.status = 'succeeded';
      parsing.sourceCount = result.sources.length;
      parsing.message = '已完成联网搜索并解析到可核验来源';
      return result;
    } catch (error) {
      parsing.code =
        error instanceof HotTopicFetchError
          ? error.code
          : ['AbortError', 'TimeoutError'].includes(
                error instanceof Error ? error.name : '',
              )
            ? 'search_cancelled'
            : 'search_network';
      parsing.message =
        error instanceof HotTopicFetchError
          ? error.message
          : parsing.code === 'search_cancelled'
            ? '联网请求超时或已取消，未取得完整响应'
            : '联网响应读取或网络连接失败，未取得完整响应';
      throw error;
    } finally {
      if (onDiagnostics) {
        try {
          const protectedValues = [target.secretKey, target.url, query];
          const safe = sanitizeHotSearchResponse(responseText, protectedValues);
          const safeText = (text: string) =>
            sanitizeHotSearchResponse(text, protectedValues).responseBody;
          onDiagnostics({
            version: 1,
            providerId: config.providerId,
            model: safeText(target.model),
            platformType: detectModelPlatform(target.url),
            protocol: target.protocol,
            apiPath: safeText(new URL(target.url).pathname),
            httpStatus,
            checkedAt: new Date(startedAt).toISOString(),
            elapsedMilliseconds: Math.max(0, Date.now() - startedAt),
            responseBody: safe.responseBody,
            truncated: responseTruncated || safe.truncated,
            parsing: { ...parsing, message: safeText(parsing.message) },
          });
        } catch {
          // 诊断展示不能改变真实请求的业务返回、错误或取消结果。
        }
      }
    }
  }
}
