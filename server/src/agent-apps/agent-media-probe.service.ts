import { ForbiddenException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import {
  downloadGeneratedImage,
  imageMime,
  readMediaJson,
} from './agent-image-utils';
import { imageGenerationRequest, visionRequest } from './agent-media.service';
import { imageGenerationResult } from '../common/ai/image-generation';
import {
  modelBillingErrorMessage,
  readModelProviderError,
} from '../common/ai/model-provider-error';
import {
  classifyMediaProbeError,
  createVisionChallenge,
  record,
  type AgentMediaProbeResult,
  type AgentMediaKind,
} from './agent-media-probe';

@Injectable()
export class AgentMediaProbeService {
  private readonly activeUsers = new Set<number>();
  private readonly attempts = new Map<number, number[]>();
  private readonly cache = new Map<
    string,
    { expires: number; result: AgentMediaProbeResult }
  >();

  constructor(private readonly providers: KnowledgeAiProvidersService) {}

  async probe(
    input: { providerId: number; model: string; kind: AgentMediaKind },
    user: AuthUser,
  ): Promise<AgentMediaProbeResult> {
    if (
      !user.isAdmin &&
      !user.permissions.some(
        (p) => p === 'AgentApp.create' || p === 'AgentApp.update',
      )
    )
      throw new ForbiddenException(
        '仅有 Agent 应用编辑或创建权限的员工可发起图片模型测试',
      );
    const dto = { ...input, model: input.model.trim() };
    const result = (
      status: AgentMediaProbeResult['status'],
      reason: string,
      message: string,
    ): AgentMediaProbeResult => ({
      ...dto,
      status,
      reason,
      message,
      checkedAt: new Date().toISOString(),
      cached: false,
    });
    let attemptedKey: string | undefined;
    const finish = (outcome: AgentMediaProbeResult) => {
      // 未知结果也短暂缓存，避免网络/响应异常后重复点击导致连续计费。
      if (attemptedKey) {
        if (this.cache.size >= 1000) {
          const oldest: unknown = this.cache.keys().next().value;
          if (typeof oldest === 'string') this.cache.delete(oldest);
        }
        this.cache.set(attemptedKey, {
          expires: Date.now() + 60000,
          result: outcome,
        });
      }
      return outcome;
    };
    const now = Date.now();
    for (const [key, item] of this.cache)
      if (item.expires <= now) this.cache.delete(key);
    for (const [id, times] of this.attempts)
      if (!times.some((t) => t > now - 60000)) this.attempts.delete(id);
    const recent = (this.attempts.get(user.userId) ?? []).filter(
      (t) => t > now - 60000,
    );
    if (this.activeUsers.has(user.userId) || recent.length >= 6)
      return result(
        'inconclusive',
        'busy',
        '已有图片测试正在处理或已达到每分钟 6 次限制，请稍后重试；未发起新的供应商调用。',
      );
    // 有界进程内保护；不写账号模型目录，不批量扫描，不自动重试付费调用。
    if (
      this.activeUsers.size >= 1000 ||
      (this.attempts.size >= 1000 && !this.attempts.has(user.userId))
    )
      return result('inconclusive', 'busy', '测试服务繁忙，请稍后重试。');
    this.activeUsers.add(user.userId);
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      dto.kind === 'vision' ? 30000 : 90000,
    );
    try {
      // 始终以服务端保存的账号/目录/协议解析目标，不接收客户端 URL 或密钥。
      const target = await this.providers.resolveAgentMediaTarget(
        dto.providerId,
        dto.model,
        dto.kind,
      );
      // 账号配置改变立即使缓存失效；摘要仅在内存中使用，不返回密钥或摘要。
      const key = `${user.userId}:${dto.kind}:${createHash('sha256').update(JSON.stringify(target)).digest('hex')}`;
      const cached = this.cache.get(key);
      if (cached) return { ...cached.result, cached: true };
      const challenge = dto.kind === 'vision' ? createVisionChallenge() : null;
      const body = challenge
        ? {
            ...visionRequest(target.model, challenge.question, challenge),
            max_tokens: 256,
          }
        : imageGenerationRequest(
            target.model,
            '白色背景中一个蓝色圆形，简洁平面图，无文字。',
            target.protocol,
          );
      controller.signal.throwIfAborted();
      attemptedKey = key;
      this.attempts.set(user.userId, [...recent, Date.now()]);
      const response = await fetch(target.url, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${target.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const error = await readModelProviderError(response);
        controller.signal.throwIfAborted();
        const failure = classifyMediaProbeError(response.status, error);
        return finish(result(failure.status, failure.reason, failure.message));
      }
      const value = await readMediaJson(response);
      const payload = record(value);
      let outcome: AgentMediaProbeResult;
      if (
        payload.error ||
        (payload.code && payload.message) ||
        modelBillingErrorMessage(value)
      ) {
        const failure = classifyMediaProbeError(400, value);
        outcome = result(failure.status, failure.reason, failure.message);
      } else if (challenge) {
        const choice: unknown = Array.isArray(payload.choices)
          ? payload.choices[0]
          : null;
        const answer = record(record(choice).message).content;
        outcome = challenge.matches(answer)
          ? result(
              'valid',
              'supported',
              '识图测试通过：已成功读取实际测试图片中的色块顺序。',
            )
          : result(
              'inconclusive',
              'unconfirmed',
              '图片测试未得到正确可核验结果，暂不能确认视觉能力；这不等于已证明是非图片模型，候选保留，可检查配置后重试。',
            );
      } else {
        const generated = await imageGenerationResult(
          value,
          target,
          controller.signal,
        );
        const data =
          generated.data ??
          (await downloadGeneratedImage(generated.url, controller.signal));
        imageMime(data);
        outcome = result(
          'valid',
          'supported',
          '生图测试通过：已返回并校验真实图片。测试图不保存到会话或公开目录，供应商可能计费。',
        );
      }
      controller.signal.throwIfAborted();
      return finish(outcome);
    } catch (error) {
      // 不泄漏供应商原始错误/响应（可能带密钥），失败也不冒充“非视觉模型”。
      const billingMessage = controller.signal.aborted
        ? null
        : modelBillingErrorMessage(
            error instanceof Error ? error.message : error,
          );
      if (billingMessage)
        return finish(
          result(
            'inconclusive',
            'quota',
            `${billingMessage}无法确认图片能力，未移除候选。`,
          ),
        );
      return finish(
        controller.signal.aborted
          ? result(
              'inconclusive',
              'timeout',
              '测试超时，无法确认图片能力；未移除候选、不自动重试，供应商可能已计费。',
            )
          : result(
              'inconclusive',
              'request_config',
              '测试未能完成，请检查已保存的账号目录、协议、端点及网络；未移除候选。若供应商已接受生图请求，可能已计费。',
            ),
      );
    } finally {
      clearTimeout(timer);
      this.activeUsers.delete(user.userId);
    }
  }
}
