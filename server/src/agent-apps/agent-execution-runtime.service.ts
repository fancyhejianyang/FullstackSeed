import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import { AGENT_EXECUTION_ACTIVE_STATUSES } from './agent-apps.constants';
import { AgentPendingAction } from './entities/agent-pending-action.entity';
import { AgentExecution } from './entities/agent-execution.entity';
import { AgentMessage } from './entities/agent-message.entity';
import { AgentSession } from './entities/agent-session.entity';

export const AGENT_EXECUTION_LEASE_GRACE_MS = 30_000;
export const AGENT_LEGACY_STALE_MS = 10 * 60_000;
const RECOVERY_INTERVAL_MS = 30_000;
const RECOVERY_BATCH_SIZE = 100;

export class AgentTimeoutError extends Error {}
export class AgentCancelledError extends Error {}

@Injectable()
export class AgentExecutionRuntimeService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AgentExecutionRuntimeService.name);
  private readonly controllers = new Map<number, AbortController>();
  private recoveryTimer?: ReturnType<typeof setInterval>;

  constructor(
    @InjectRepository(AgentExecution)
    private readonly executionRepository: Repository<AgentExecution>,
    private readonly dataSource: DataSource,
    private readonly providersService: KnowledgeAiProvidersService,
  ) {}

  async onModuleInit() {
    await this.recoverExpiredExecutions().catch((error: unknown) => {
      this.logger.error(
        `Agent 失联任务启动恢复失败：${error instanceof Error ? error.message : String(error)}`,
      );
    });
    this.recoveryTimer = setInterval(() => {
      void this.recoverExpiredExecutions().catch((error: unknown) => {
        this.logger.error(
          `Agent 失联任务定时恢复失败：${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, RECOVERY_INTERVAL_MS);
    this.recoveryTimer.unref();
  }

  onModuleDestroy() {
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
    for (const controller of this.controllers.values()) {
      controller.abort(new AgentCancelledError('服务正在停止'));
    }
    this.controllers.clear();
  }

  async run<T>(
    executionId: number,
    timeoutSeconds: number,
    task: () => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutError = new AgentTimeoutError('Agent execution timed out');
    this.controllers.set(executionId, controller);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cancelled = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener(
        'abort',
        () =>
          reject(
            controller.signal.reason instanceof Error
              ? controller.signal.reason
              : new AgentCancelledError('Agent execution cancelled'),
          ),
        { once: true },
      );
    });
    try {
      timeout = setTimeout(
        () => controller.abort(timeoutError),
        timeoutSeconds * 1000,
      );
      timeout.unref();
      return await this.providersService.withExecutionSignal(
        controller.signal,
        () => Promise.race([task(), cancelled]),
      );
    } finally {
      if (timeout) clearTimeout(timeout);
      if (this.controllers.get(executionId) === controller) {
        this.controllers.delete(executionId);
      }
    }
  }

  cancel(executionId: number, reason = '用户已停止请求') {
    const controller = this.controllers.get(executionId);
    if (!controller || controller.signal.aborted) return false;
    controller.abort(new AgentCancelledError(reason));
    return true;
  }

  async recoverExpiredExecutions() {
    const now = new Date();
    const legacyCutoff = new Date(now.getTime() - AGENT_LEGACY_STALE_MS);
    const candidates = await this.executionRepository.find({
      where: [
        {
          status: In(AGENT_EXECUTION_ACTIVE_STATUSES),
          leaseExpiresAt: LessThanOrEqual(now),
        },
        {
          status: In(AGENT_EXECUTION_ACTIVE_STATUSES),
          leaseExpiresAt: IsNull(),
          startedAt: LessThanOrEqual(legacyCutoff),
        },
      ],
      order: { id: 'ASC' },
      take: RECOVERY_BATCH_SIZE,
    });
    for (const execution of candidates) {
      await this.recoverOne(execution, now);
    }
    return candidates.length;
  }

  private async recoverOne(execution: AgentExecution, now: Date) {
    await this.dataSource.transaction(async (manager) => {
      const executions = manager.getRepository(AgentExecution);
      const updated = await executions.update(
        {
          id: execution.id,
          status: In(AGENT_EXECUTION_ACTIVE_STATUSES),
        },
        {
          status: 'failed',
          statusReason: 'stale_lease',
          failureStage: 'recovery',
          errorMessage: '执行进程已中断，系统已自动结束失联任务；请核实后重试',
          finishedAt: now,
          heartbeatAt: now,
        },
      );
      if (!updated.affected) return;
      if (execution.pendingActionId) {
        await manager
          .getRepository(AgentPendingAction)
          .update(
            { id: execution.pendingActionId, status: 'submitting' },
            { status: 'failed' },
          );
      }
      const messages = manager.getRepository(AgentMessage);
      const existingMessage = await messages.findOne({
        where: { executionId: execution.id, role: 'assistant' },
      });
      const content =
        '本次执行因服务中断未能完成，系统已自动结束任务。请先核实执行记录，再决定是否重试。';
      let appendedMessage = false;
      if (!existingMessage && execution.messageId) {
        await messages.save(
          messages.create({
            sessionId: execution.sessionId,
            userId: execution.userId,
            role: 'assistant',
            messageType: 'error',
            content,
            structuredData: { action: 'clarify', reason: 'stale_lease' },
            executionId: execution.id,
            clientMessageId: null,
          }),
        );
        await manager
          .getRepository(AgentSession)
          .increment({ id: execution.sessionId }, 'messageCount', 1);
        appendedMessage = true;
      }
      await manager.getRepository(AgentSession).update(execution.sessionId, {
        ...(appendedMessage ? { lastMessage: content } : {}),
        lastExecutionStatus: 'failed',
      });
    });
    this.cancel(execution.id, '执行租约已过期');
  }
}
