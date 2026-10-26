import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { KnowledgeAiProvidersService } from './knowledge-ai-providers.service';
import { ModelEndpointsService } from '../model-endpoints/model-endpoints.service';
import { BUILTIN_MODEL_ENDPOINTS } from '../model-endpoints/model-endpoint.builtins';
import { TestModelEndpointDto } from './dto/model-endpoint-test.dto';
import {
  endpointTestResponse,
  endpointTestTemplate,
  record,
} from './model-endpoint-test.utils';
import { readMediaJson, imageMime } from '../common/ai/image-utils';
import { generationResult } from '../common/ai/image-generation';
import { videoTaskId, videoTaskResult } from '../common/ai/video-generation';
import {
  mediaProtocol,
  type ModelFunction,
} from '../model-endpoints/model-endpoint.constants';
import { extendedTokenhubResult } from '../common/ai/tokenhub-adapters';
import {
  modelBillingErrorMessage,
  readModelProviderError,
} from '../common/ai/model-provider-error';
import type { TestAiFeatureModelDto } from '../ai-feature-configs/dto/ai-feature-config.dto';
import { createVisionChallenge } from '../agent-apps/agent-media-probe';
import { isRetiredModelError } from '../common/ai/model-retirement';
import { detectModelPlatform } from '../model-endpoints/model-endpoint.constants';

type TestTarget = Omit<
  Awaited<ReturnType<KnowledgeAiProvidersService['resolveEndpointTestTarget']>>,
  'functionLabel' | 'ruleName' | 'source' | 'functionType'
> & {
  functionType: ModelFunction;
  functionLabel?: string;
  ruleName?: string;
  source?: 'configured' | 'builtin' | 'standard';
};
type FeatureSelection = Omit<TestAiFeatureModelDto, 'requestId'>;
export interface ModelEndpointTestResult {
  requestId: string;
  status: 'running' | 'accepted' | 'succeeded' | 'failed' | 'unknown';
  message: string;
  httpStatus: number | null;
  responseBody: string;
  taskId: string | null;
  elapsedMilliseconds: number;
  checkedAt: string;
  model?: string;
  apiPath?: string;
  providerId?: number;
  functionLabel?: string;
  ruleName?: string;
  source?: 'configured' | 'builtin' | 'standard';
  featureType?: TestAiFeatureModelDto['featureType'];
  useMineru?: boolean;
  webSearchMode?: TestAiFeatureModelDto['webSearchMode'];
  modelRemoved?: boolean;
}
interface TestRecord {
  origin: 'card' | 'feature';
  feature?: FeatureSelection;
  visionMatches?: (answer: unknown) => boolean;
  endpointId: number;
  providerId: number;
  fingerprint: string;
  route: string;
  startedAt: number;
  expiresAt: number;
  querying: boolean;
  model: string;
  result: ModelEndpointTestResult;
}

@Injectable()
export class ModelEndpointTestsService {
  private readonly records = new Map<string, TestRecord>();
  private readonly activeUsers = new Set<number>();
  private readonly attempts = new Map<number, number[]>();

  constructor(
    private readonly providers: KnowledgeAiProvidersService,
    private readonly endpoints: ModelEndpointsService,
  ) {}

  async options(endpointId: number, userId: number) {
    this.prune();
    const card = await this.endpoints.findOne(endpointId);
    const recent = [...this.records.entries()]
      .filter(
        ([key, item]) =>
          key.startsWith(`${userId}:`) &&
          item.origin === 'card' &&
          item.endpointId === endpointId,
      )
      .at(-1)?.[1];
    const accountOptions =
      await this.providers.endpointTestAccountOptions(endpointId);
    return {
      card,
      accountCatalogRequired: card.source === 'builtin',
      ...accountOptions,
      requestBody: endpointTestTemplate(
        card.source === 'builtin'
          ? { ...card, modelCode: 'REPLACE_WITH_MODEL_CODE' }
          : card,
      ),
      recentTest: recent
        ? { providerId: recent.providerId, result: { ...recent.result } }
        : null,
    };
  }

  async start(endpointId: number, dto: TestModelEndpointDto, userId: number) {
    this.prune();
    const bodyText = JSON.stringify(dto.requestBody);
    if (Buffer.byteLength(bodyText) > 65536)
      throw new BadRequestException(
        '测试请求参数不能超过 64 KB，大文件请使用可访问的素材地址',
      );
    if (bodyText.includes('REPLACE_WITH_'))
      throw new BadRequestException(
        '请按官方文档替换请求参数中的全部 REPLACE_WITH_ 占位符后再测试',
      );
    const fingerprint = createHash('sha256')
      .update(`${endpointId}:${dto.providerId}:${dto.model ?? ''}:${bodyText}`)
      .digest('hex');
    return this.execute(
      'card',
      endpointId,
      dto.providerId,
      dto.requestId,
      fingerprint,
      userId,
      () =>
        dto.model === undefined
          ? this.providers.resolveEndpointTestTarget(endpointId, dto.providerId)
          : this.providers.resolveEndpointTestTarget(
              endpointId,
              dto.providerId,
              dto.model,
            ),
      () => dto.requestBody,
    );
  }

  async startFeature(dto: TestAiFeatureModelDto, userId: number) {
    const selection: FeatureSelection = {
      providerId: dto.providerId,
      model: dto.model.trim(),
      featureType: dto.featureType,
      useMineru: !!dto.useMineru,
      // 忽略历史手动联网设置；功能切换仅测试对应模型能力。
      webSearchMode: 'disabled',
    };
    // 指纹只绑定稳定选择；随机测试图只在真正创建新请求时生成。
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(selection))
      .digest('hex');
    return this.execute(
      'feature',
      0,
      dto.providerId,
      dto.requestId,
      fingerprint,
      userId,
      () => this.resolveFeatureTarget(selection),
      (target, entry) => {
        if (target.functionType === 'vision') {
          const challenge = createVisionChallenge();
          entry.visionMatches = (answer) => challenge.matches(answer);
          return {
            model: target.model,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: challenge.question },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${challenge.mimeType};base64,${challenge.data.toString('base64')}`,
                    },
                  },
                ],
              },
            ],
            max_tokens: 256,
            stream: false,
          };
        }
        return endpointTestTemplate({
          modelCode: target.model,
          functionType: target.functionType,
          protocol: target.protocol,
        });
      },
      selection,
    );
  }

  recentFeatures(userId: number) {
    this.prune();
    return [...this.records.entries()]
      .filter(
        ([key, entry]) =>
          key.startsWith(`${userId}:`) && entry.origin === 'feature',
      )
      .slice(-10)
      .reverse()
      .map(([, entry]) => ({ ...entry.result }));
  }

  private async resolveFeatureTarget(
    selection: FeatureSelection,
  ): Promise<TestTarget> {
    return this.providers.resolveFeatureTestTarget({
      id: selection.providerId,
      model: selection.model,
      featureType:
        selection.featureType === 'ocr' && selection.useMineru
          ? 'documentParse'
          : selection.featureType,
    });
  }

  private async execute(
    origin: TestRecord['origin'],
    endpointId: number,
    providerId: number,
    requestId: string,
    selectionFingerprint: string,
    userId: number,
    resolveTarget: () => Promise<TestTarget>,
    buildBody: (
      target: TestTarget,
      entry: TestRecord,
    ) => Record<string, unknown>,
    feature?: FeatureSelection,
  ) {
    this.prune();
    const key = `${userId}:${requestId}`;
    const fingerprint = `${origin}:${selectionFingerprint}`;
    const previous = this.records.get(key);
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new ConflictException('同一次测试编号不能更换卡片、账号或参数');
      return { ...previous.result };
    }
    const recent = (this.attempts.get(userId) ?? []).filter(
      (time) => time > Date.now() - 60000,
    );
    if (
      this.activeUsers.has(userId) ||
      recent.length >= 6 ||
      this.records.size >= 500
    )
      throw new BadRequestException(
        '已有测试正在执行或测试过于频繁，请稍后再试',
      );
    this.activeUsers.add(userId);
    try {
      const target = await resolveTarget();
      if (target.functionType === 'webSearch')
        throw new BadRequestException(
          '联网搜索接口卡片已移除；热点由系统自动获取',
        );
      const entry: TestRecord = {
        origin,
        feature,
        endpointId,
        providerId,
        fingerprint,
        route: this.route(target),
        startedAt: Date.now(),
        expiresAt: Date.now() + 30 * 60000,
        querying: false,
        model: target.model,
        result: {
          requestId,
          status: 'running',
          message: '正在调用接口',
          httpStatus: null,
          responseBody: '',
          taskId: null,
          elapsedMilliseconds: 0,
          checkedAt: new Date().toISOString(),
          model: target.model,
          apiPath: new URL(target.url).pathname,
          providerId,
          functionLabel: target.functionLabel,
          ruleName: target.ruleName,
          source: target.source,
          ...(feature
            ? {
                featureType: feature.featureType,
                useMineru: feature.useMineru,
                webSearchMode: feature.webSearchMode,
              }
            : {}),
        },
      };
      this.records.set(key, entry);
      this.attempts.set(userId, [...recent, Date.now()]);
      try {
        const body = {
          ...buildBody(target, entry),
          model: target.model,
          ...(['openaiChat', 'openaiChatSearch', 'openaiResponses'].includes(
            target.protocol,
          )
            ? { stream: false }
            : {}),
        };
        await this.request(entry, target, target.url, 'POST', body);
      } catch {
        this.finish(
          entry,
          'unknown',
          '请求超时、网络异常或响应格式无法确认；供应商可能已受理，请勿直接重复生成。',
        );
      }
      return { ...entry.result };
    } finally {
      this.activeUsers.delete(userId);
    }
  }

  async query(endpointId: number, requestId: string, userId: number) {
    return this.queryRecord('card', endpointId, requestId, userId);
  }

  async queryFeature(requestId: string, userId: number) {
    return this.queryRecord('feature', 0, requestId, userId);
  }

  private async queryRecord(
    origin: TestRecord['origin'],
    endpointId: number,
    requestId: string,
    userId: number,
  ) {
    this.prune();
    const entry = this.records.get(`${userId}:${requestId}`);
    if (!entry || entry.origin !== origin || entry.endpointId !== endpointId)
      throw new NotFoundException(
        '测试记录不存在或已过期，服务重启也会清空临时结果；请先核实供应商任务，避免重复生成',
      );
    if (
      !entry.result.taskId ||
      ['succeeded', 'failed'].includes(entry.result.status) ||
      entry.querying
    )
      return { ...entry.result };
    entry.querying = true;
    try {
      const target =
        entry.origin === 'feature' && entry.feature
          ? await this.resolveFeatureTarget(entry.feature)
          : await this.providers.resolveEndpointTestTarget(
              endpointId,
              entry.providerId,
              entry.model,
            );
      if (this.route(target) !== entry.route || !target.taskUrlTemplate)
        throw new BadRequestException(
          '账号或接口已变化，不能使用新路径查询旧任务',
        );
      const url = target.taskUrlTemplate.replace(
        '{taskId}',
        encodeURIComponent(entry.result.taskId),
      );
      if (new URL(url).origin !== new URL(target.url).origin)
        throw new BadRequestException('任务查询必须与生成接口同域');
      const method = target.taskMethod ?? 'GET';
      await this.request(
        entry,
        target,
        url,
        method,
        method === 'POST'
          ? { model: target.model, id: entry.result.taskId }
          : undefined,
        true,
      );
    } catch {
      this.finish(
        entry,
        'unknown',
        '任务查询未完成，请核对账号和接口后继续查询原任务；不会重新生成。',
      );
    } finally {
      entry.querying = false;
    }
    return { ...entry.result };
  }

  private async request(
    entry: TestRecord,
    target: TestTarget,
    url: string,
    method: 'POST' | 'GET',
    body?: Record<string, unknown>,
    querying = false,
  ) {
    entry.result.httpStatus = null;
    entry.result.responseBody = '';
    const response = await fetch(url, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(querying ? 30000 : 60000),
      headers: {
        Authorization: `Bearer ${target.secretKey}`,
        'Content-Type': 'application/json',
        ...(method === 'POST' && target.protocol === 'dashscopeVideo'
          ? { 'X-DashScope-Async': 'enable' }
          : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    entry.result.httpStatus = response.status;
    let value: unknown;
    try {
      value = response.ok
        ? await readMediaJson(response)
        : await readModelProviderError(response);
    } catch {
      this.finish(
        entry,
        querying || response.ok ? 'unknown' : 'failed',
        `HTTP ${response.status}，接口未返回有效 JSON 或响应超过限制`,
      );
      return;
    }
    entry.result.responseBody = endpointTestResponse(value, target.secretKey);
    const payload = record(value);
    const billingMessage = modelBillingErrorMessage(value);
    if (billingMessage) {
      this.finish(
        entry,
        querying ? 'unknown' : 'failed',
        querying
          ? `${billingMessage} 原任务状态尚未确认，处理账号计费问题后可继续查询；不会重新生成。`
          : billingMessage,
      );
      return;
    }
    const isErrorResponse =
      !response.ok ||
      !!payload.error ||
      !!(payload.code && payload.code !== '0' && payload.message);
    if (
      !querying &&
      isErrorResponse &&
      new URL(url).protocol === 'https:' &&
      new URL(url).origin === new URL(target.url).origin &&
      detectModelPlatform(url) !== 'custom' &&
      isRetiredModelError(value, target.model)
    ) {
      let removed = false;
      try {
        removed = await this.providers.removeRetiredModel({
          providerId: entry.providerId,
          model: target.model,
          url: target.url,
          secretKey: target.secretKey,
        });
      } catch {
        // 目录写入失败不能抹掉已经确认的供应商退役结果，也不能谎报移除成功。
      }
      entry.result.modelRemoved = removed;
      this.finish(
        entry,
        'failed',
        removed
          ? '官方确认该模型已下线，已从当前账号模型目录移除，请重新选择模型。'
          : '官方确认该模型已下线，账号目录尚未更新，请检查账号后手动移除该模型。',
      );
      return;
    }
    const extended = response.ok
      ? extendedTokenhubResult(value, target.protocol, !querying)
      : null;
    if (extended) {
      if (extended.taskId) entry.result.taskId = extended.taskId;
      if (extended.status === 'pending') {
        if (target.executionMode === 'async')
          this.accept(entry, extended.taskId ?? entry.result.taskId);
        else
          this.finish(
            entry,
            'unknown',
            '同步接口尚未返回完成结果，无法确认成功；不会自动重新提交。',
          );
      } else if (extended.status === 'succeeded') {
        if (extended.url) this.resultUrl(extended.url);
        this.finish(entry, 'succeeded', '接口已按对应协议返回有效结果。');
      } else if (extended.status === 'failed')
        this.finish(
          entry,
          'failed',
          '供应商返回失败，请查看脱敏响应；不会自动重投。',
        );
      else
        this.finish(
          entry,
          'unknown',
          extended.message ??
            '响应缺少该协议的有效终态或结果，请查看返回内容并核实原任务。',
        );
      return;
    }
    if (
      !response.ok ||
      payload.error ||
      (payload.code && payload.code !== '0' && payload.message)
    ) {
      // 查询失败不等于生成任务失败，保留原编号以便继续核实。
      this.finish(
        entry,
        querying ? 'unknown' : 'failed',
        `接口返回错误（HTTP ${response.status}），请查看脱敏响应；不会自动重投。`,
      );
      return;
    }
    const scene = target.functionType;
    if (
      scene === 'chat' ||
      scene === 'vision' ||
      scene === 'videoUnderstanding'
    ) {
      const choice = record(
        Array.isArray(payload.choices) ? payload.choices[0] : null,
      );
      const content = record(choice.message).content;
      const hasText =
        typeof content === 'string'
          ? !!content.trim()
          : Array.isArray(content) &&
            content.some(
              (part: unknown) =>
                typeof record(part).text === 'string' &&
                String(record(part).text).trim(),
            );
      if (!hasText) throw new Error('missing_content');
      if (
        entry.visionMatches &&
        !entry.visionMatches(
          typeof content === 'string'
            ? content
            : (content as unknown[])
                .map((part) =>
                  typeof record(part).text === 'string'
                    ? record(part).text
                    : '',
                )
                .join(''),
        )
      ) {
        this.finish(
          entry,
          'unknown',
          '接口已响应，但测试图片结果未通过核验，无法确认识图能力；不修改模型目录。',
        );
        return;
      }
      this.finish(entry, 'succeeded', '接口已返回有效消息内容。');
    } else if (scene === 'embedding' || scene === 'multimodalEmbedding') {
      const first = record(
        Array.isArray(payload.data) ? payload.data[0] : null,
      );
      const embedding = first.embedding;
      if (
        !Array.isArray(embedding) ||
        !embedding.length ||
        !embedding.every(
          (item) => typeof item === 'number' && Number.isFinite(item),
        )
      )
        throw new Error('invalid_embedding');
      this.finish(
        entry,
        'succeeded',
        `接口已返回有效向量，维度 ${embedding.length}。`,
      );
    } else if (scene === 'textToImage' || scene === 'imageToImage') {
      if (target.executionMode === 'async' && payload.state !== 'success') {
        if (payload.state === 'failed') {
          this.finish(entry, 'failed', '供应商图片任务失败，请查看返回内容。');
          return;
        }
        if (
          !['created', 'queueing', 'processing'].includes(String(payload.state))
        )
          throw new Error('unknown_image_task_state');
        this.accept(
          entry,
          method === 'GET' ? entry.result.taskId : payload.task_id,
        );
        return;
      }
      const image = generationResult(value, mediaProtocol(target.protocol));
      if (image.data) imageMime(image.data);
      else this.resultUrl(image.url);
      this.finish(
        entry,
        'succeeded',
        image.data ? '接口已返回有效图片数据。' : '接口已返回图片结果地址。',
      );
    } else {
      if (method === 'POST')
        this.accept(entry, videoTaskId(value, mediaProtocol(target.protocol)));
      const hasState =
        target.protocol === 'dashscopeVideo'
          ? !!record(payload.output).task_status
          : target.protocol === 'tokenhubHunyuanVideo'
            ? !!payload.status
            : !!payload.state;
      const state =
        method === 'GET' || hasState
          ? videoTaskResult(value, mediaProtocol(target.protocol))
          : null;
      if (state?.status === 'succeeded') {
        this.resultUrl(state.videoUrl);
        this.finish(entry, 'succeeded', '视频任务成功，已返回视频地址。');
      } else if (state?.status === 'failed')
        this.finish(entry, 'failed', '供应商视频任务失败，请查看返回内容。');
      else if (method === 'GET')
        this.finish(
          entry,
          'accepted',
          '供应商任务仍在处理中，继续查询原任务。',
        );
    }
  }

  private accept(entry: TestRecord, taskId: unknown) {
    if (typeof taskId !== 'string' || !taskId.trim() || taskId.length > 256)
      throw new Error('missing_task_id');
    entry.result.taskId = taskId.trim();
    this.finish(
      entry,
      'accepted',
      '接口已受理并返回任务编号，尚未确认生成成功；后续只查询此任务。',
    );
  }

  private resultUrl(value: unknown) {
    if (typeof value !== 'string') throw new Error('missing_url');
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error('invalid_result_url');
  }

  private finish(
    entry: TestRecord,
    status: ModelEndpointTestResult['status'],
    message: string,
  ) {
    Object.assign(entry.result, {
      status,
      message,
      elapsedMilliseconds: Date.now() - entry.startedAt,
      checkedAt: new Date().toISOString(),
    });
  }

  private route(target: TestTarget) {
    return JSON.stringify([
      target.model,
      target.url,
      target.taskUrlTemplate,
      target.protocol,
      target.functionType,
    ]);
  }

  private prune() {
    const now = Date.now();
    for (const [key, entry] of this.records) {
      let retiredSearch = false;
      try {
        const route: unknown = JSON.parse(entry.route);
        retiredSearch = Array.isArray(route) && route[4] === 'webSearch';
      } catch {
        // 历史内存记录不是可执行输入，不能因为其格式影响其它测试记录。
      }
      const retiredBuiltin =
        entry.origin === 'card' &&
        entry.endpointId < 0 &&
        !BUILTIN_MODEL_ENDPOINTS.some((card) => card.id === entry.endpointId);
      if (entry.expiresAt <= now || retiredSearch || retiredBuiltin)
        this.records.delete(key);
    }
    for (const [key, times] of this.attempts)
      if (!times.some((time) => time > now - 60000)) this.attempts.delete(key);
  }
}
