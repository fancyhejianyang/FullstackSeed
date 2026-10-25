import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { KnowledgeAiProvidersService } from './knowledge-ai-providers.service';
import { ModelEndpointsService } from '../model-endpoints/model-endpoints.service';
import { TestModelEndpointDto } from './dto/model-endpoint-test.dto';
import {
  endpointTestResponse,
  endpointTestTemplate,
  record,
} from './model-endpoint-test.utils';
import { readMediaJson, imageMime } from '../common/ai/image-utils';
import { generationResult } from '../common/ai/image-generation';
import { videoTaskId, videoTaskResult } from '../common/ai/video-generation';
import { mediaProtocol } from '../model-endpoints/model-endpoint.constants';

type TestTarget = Awaited<
  ReturnType<KnowledgeAiProvidersService['resolveEndpointTestTarget']>
>;
export interface ModelEndpointTestResult {
  requestId: string;
  status: 'running' | 'accepted' | 'succeeded' | 'failed' | 'unknown';
  message: string;
  httpStatus: number | null;
  responseBody: string;
  taskId: string | null;
  elapsedMilliseconds: number;
  checkedAt: string;
}
interface TestRecord {
  endpointId: number;
  providerId: number;
  fingerprint: string;
  route: string;
  startedAt: number;
  expiresAt: number;
  querying: boolean;
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
          key.startsWith(`${userId}:`) && item.endpointId === endpointId,
      )
      .at(-1)?.[1];
    return {
      card,
      accounts: await this.providers.endpointTestAccounts(endpointId),
      requestBody: endpointTestTemplate(card),
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
        '测试请求参数不能超过 64 KB，请使用图片或视频地址',
      );
    if (bodyText.includes('REPLACE_WITH_'))
      throw new BadRequestException(
        '请先将请求参数中的参考图片占位符替换为可访问的图片地址',
      );
    const key = `${userId}:${dto.requestId}`;
    const fingerprint = createHash('sha256')
      .update(`${endpointId}:${dto.providerId}:${bodyText}`)
      .digest('hex');
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
      const target = await this.providers.resolveEndpointTestTarget(
        endpointId,
        dto.providerId,
      );
      const entry: TestRecord = {
        endpointId,
        providerId: dto.providerId,
        fingerprint,
        route: this.route(target),
        startedAt: Date.now(),
        expiresAt: Date.now() + 30 * 60000,
        querying: false,
        result: {
          requestId: dto.requestId,
          status: 'running',
          message: '正在调用接口',
          httpStatus: null,
          responseBody: '',
          taskId: null,
          elapsedMilliseconds: 0,
          checkedAt: new Date().toISOString(),
        },
      };
      this.records.set(key, entry);
      this.attempts.set(userId, [...recent, Date.now()]);
      try {
        const body = {
          ...dto.requestBody,
          model: target.model,
          ...(['chat', 'vision'].includes(target.functionType)
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
    this.prune();
    const entry = this.records.get(`${userId}:${requestId}`);
    if (!entry || entry.endpointId !== endpointId)
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
      const target = await this.providers.resolveEndpointTestTarget(
        endpointId,
        entry.providerId,
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
      await this.request(entry, target, url, 'GET');
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
  ) {
    entry.result.httpStatus = null;
    entry.result.responseBody = '';
    const response = await fetch(url, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(method === 'POST' ? 60000 : 30000),
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
      value = await readMediaJson(response);
    } catch {
      this.finish(
        entry,
        method === 'GET' || response.ok ? 'unknown' : 'failed',
        `HTTP ${response.status}，接口未返回有效 JSON 或响应超过限制`,
      );
      return;
    }
    entry.result.responseBody = endpointTestResponse(value, target.secretKey);
    const payload = record(value);
    if (!response.ok || payload.error || (payload.code && payload.message)) {
      // 查询失败不等于生成任务失败，保留原编号以便继续核实。
      this.finish(
        entry,
        method === 'GET' ? 'unknown' : 'failed',
        `接口返回错误（HTTP ${response.status}），请查看脱敏响应；不会自动重投。`,
      );
      return;
    }
    const scene = target.functionType;
    if (scene === 'chat' || scene === 'vision') {
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
      this.finish(entry, 'succeeded', '接口已返回有效消息内容。');
    } else if (scene === 'embedding') {
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
    for (const [key, entry] of this.records)
      if (entry.expiresAt <= now) this.records.delete(key);
    for (const [key, times] of this.attempts)
      if (!times.some((time) => time > now - 60000)) this.attempts.delete(key);
  }
}
