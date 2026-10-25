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
import {
  modelBillingErrorMessage,
  readModelProviderError,
} from '../common/ai/model-provider-error';

export {
  bailianResponsesUrl,
  parseVerifiedSearchResponse,
} from './knowledge-web-search.utils';
export type {
  VerifiedSearchSource,
  VerifiedSearchResult,
} from './knowledge-web-search.utils';

async function readLimitedJson(response: Response): Promise<unknown> {
  if (!response.body)
    throw new HotTopicFetchError('search_empty', 'AI 联网返回空响应');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 3 * 1024 * 1024)
        throw new HotTopicFetchError(
          'search_large',
          'AI 联网响应超过 3 MB 限制',
        );
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch {
      throw new HotTopicFetchError(
        'search_format',
        'AI 联网返回的数据格式不受支持',
      );
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

@Injectable()
export class KnowledgeWebSearchService {
  constructor(private readonly providers: KnowledgeAiProvidersService) {}

  async search(
    config: AiFeatureConfig,
    query: string,
    signal: AbortSignal,
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
    if (config.webSearchMode === 'bailianChat')
      throw new HotTopicFetchError(
        'search_unsupported',
        '旧百炼 Chat 联网不返回本项目所需的搜索来源，请选择百炼 Responses；腾讯账号请选择腾讯 TokenHub 原生搜索，本次未调用计费接口',
      );
    if (!['bailianResponses', 'tokenhubSearch'].includes(config.webSearchMode))
      throw new HotTopicFetchError(
        'search_disabled',
        '该 AI 配置未开启受支持的联网搜索，请在 AI 功能配置中选择对应平台的原生搜索',
      );
    signal.throwIfAborted();
    let target: KnowledgeAiWebSearchTarget;
    try {
      target = await this.providers.resolveWebSearchTarget({
        id: config.providerId,
        model: config.model,
        webSearchMode: config.webSearchMode,
      });
    } catch (error) {
      if (error instanceof HotTopicFetchError) throw error;
      throw new HotTopicFetchError(
        'search_config',
        error instanceof HttpException
          ? error.message
          : '联网搜索配置解析失败，请检查账号、模型及厂商联网接口卡片',
      );
    }
    signal.throwIfAborted();
    const boundedSignal = AbortSignal.any([
      signal,
      AbortSignal.timeout(120000),
    ]);
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
          webSearchMode: config.webSearchMode,
          protocol: target.protocol,
          model: target.model,
          query,
          enableThinking: config.enableThinking,
        }),
      ),
    });
    if (!response.ok) {
      const billing = modelBillingErrorMessage(
        await readModelProviderError(response),
      );
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
    const value = await readLimitedJson(response);
    const billing = modelBillingErrorMessage(value);
    if (billing) throw new HotTopicFetchError('search_billing', billing);
    return config.webSearchMode === 'tokenhubSearch'
      ? parseTokenhubSearchResponse(value, target.protocol)
      : parseVerifiedSearchResponse(value);
  }
}
