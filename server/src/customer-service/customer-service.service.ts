import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  DataSource,
  EntityManager,
  In,
  LessThan,
  QueryRunner,
  Repository,
} from 'typeorm';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { ExternalApp } from '../external-apps/entities/external-app.entity';
import { KnowledgeAiChatSession } from '../knowledge-ai-chat/entities/knowledge-ai-chat-session.entity';
import { KnowledgeAiChatService } from '../knowledge-ai-chat/knowledge-ai-chat.service';
import type { InitKnowledgeAiChatSessionDto } from '../knowledge-ai-chat/dto/knowledge-ai-chat.dto';
import { CustomerChatTask } from './entities/customer-chat-task.entity';
import { CustomerChatMessage } from './entities/customer-chat-message.entity';
import {
  QueryCustomerSessionsDto,
  SendCustomerMessageDto,
} from './dto/customer-service.dto';

const ACTIVE_STATUSES = ['queued', 'running', 'cancelling'] as const;
const QUEUE_LIMIT = 200;
const QUEUE_TIMEOUT_MS = 15 * 60_000;
const EXECUTION_TIMEOUT_MS = 180_000;
const HISTORY_PAGE_SIZE = 200;

interface RunningTask {
  controller: AbortController;
  publishAllowed: boolean;
  answer: string;
}

export interface CustomerSessionSnapshot {
  sessionId: number;
  title: string;
  externalAppId: number;
  appName: string;
  serviceStatus: KnowledgeAiChatSession['serviceStatus'];
  serviceVersion: number;
  assignedAgentId: number | null;
  assignedAgentName: string | null;
  queuePosition: number | null;
  activeTask: {
    id: number;
    status: 'queued' | 'running' | 'cancelling';
    answer: string;
  } | null;
  messages: Array<{
    id: number;
    sessionId: number;
    role: CustomerChatMessage['role'];
    content: string;
    createdAt: Date;
    agentName: string | null;
    clientMessageId: string | null;
    taskId: number | null;
  }>;
  hasMoreMessages: boolean;
  nextBeforeMessageId: number | null;
  updatedAt: Date;
}

/**
 * 基于 demo 的 service/repository 分层，AI 只作为调度后的执行器。
 * 首版只允许一个服务进程：数据库事务保护领取和人工接手，进程内承载取消信号与 SSE。
 * 不在模型生成期间持有事务；running/cancelling 名额直到执行器真正 settle 才释放。
 */
@Injectable()
export class CustomerServiceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CustomerServiceService.name);
  private readonly events = new EventEmitter();
  private readonly running = new Map<number, RunningTask>();
  private timer?: ReturnType<typeof setInterval>;
  private draining = false;
  private stopping = false;
  private lockRunner?: QueryRunner;
  private ready = false;
  private readonly executions = new Set<Promise<void>>();
  private drainPromise?: Promise<void>;
  private readonly pendingFinalizers = new Map<
    number,
    { sessionId: number; finish: () => Promise<void> }
  >();
  private readonly finishing = new Set<number>();

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(KnowledgeAiChatSession)
    private readonly sessions: Repository<KnowledgeAiChatSession>,
    @InjectRepository(CustomerChatTask)
    private readonly tasks: Repository<CustomerChatTask>,
    @InjectRepository(CustomerChatMessage)
    private readonly messages: Repository<CustomerChatMessage>,
    @InjectRepository(ExternalApp)
    private readonly apps: Repository<ExternalApp>,
    private readonly ai: KnowledgeAiChatService,
  ) {
    this.events.setMaxListeners(0);
  }

  async onModuleInit() {
    // GET_LOCK 绑定专用连接，阻止第二个服务实例误将本进程任务当作孤儿恢复。
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    try {
      const rows: Array<{ acquired: number }> = await runner.query(
        "SELECT GET_LOCK(SHA2(CONCAT(DATABASE(), ':customer-service-dispatch'), 256), 0) AS acquired",
      );
      if (Number(rows[0]?.acquired) !== 1)
        throw new Error('客服调度首版仅支持单服务进程，已有另一实例持有调度锁');
      this.lockRunner = runner;
      await this.recoverInterruptedTasks();
      this.ready = true;
    } catch (error) {
      await runner
        .query(
          "SELECT RELEASE_LOCK(SHA2(CONCAT(DATABASE(), ':customer-service-dispatch'), 256))",
        )
        .catch(() => undefined);
      await runner.release();
      throw error;
    }
    this.timer = setInterval(() => this.schedule(), 2000);
    this.timer.unref();
    this.schedule();
  }

  private async recoverInterruptedTasks() {
    // 缺迁移时启动即失败，不启动反复报错的后台定时器。
    const interrupted = await this.tasks.find({
      where: { status: In(['running', 'cancelling']) },
    });
    for (const task of interrupted) {
      await this.withAppLock(
        task.externalAppId,
        async (manager) => {
          const current = await manager.findOneBy(CustomerChatTask, {
            id: task.id,
          });
          if (!current || !['running', 'cancelling'].includes(current.status))
            return;
          await manager.update(CustomerChatTask, current.id, {
            status: current.status === 'cancelling' ? 'cancelled' : 'failed',
            finishedAt: new Date(),
            failureReason: '服务重启，原 AI 任务已中断',
          });
          await this.systemMessage(
            manager,
            task.sessionId,
            '服务重启，上一轮 AI 回答已中断，请重新提问或转人工。',
            task.id,
          );
        },
        true,
      );
    }
  }

  async onModuleDestroy() {
    this.stopping = true;
    this.ready = false;
    if (this.timer) clearInterval(this.timer);
    // 先等待领取事务返回，避免释放调度锁后旧进程又启动刚领取的任务。
    await this.drainPromise?.catch(() => undefined);
    for (const task of this.running.values()) {
      task.publishAllowed = false;
      task.controller.abort(new Error('服务正在关闭'));
    }
    this.events.emit('shutdown');
    this.events.removeAllListeners();
    await Promise.allSettled([...this.executions]);
    if (this.lockRunner) {
      await this.lockRunner
        .query(
          "SELECT RELEASE_LOCK(SHA2(CONCAT(DATABASE(), ':customer-service-dispatch'), 256))",
        )
        .catch(() => undefined);
      await this.lockRunner.release();
    }
  }

  async initSession(app: ExternalApp, dto: InitKnowledgeAiChatSessionDto = {}) {
    this.assertReady();
    const result = await this.ai.initSession(dto, app);
    const sessionToken = randomBytes(32).toString('hex');
    await this.sessions.update(result.sessionId, {
      externalAppId: app.id,
      sessionTokenHash: this.hashToken(sessionToken),
      serviceStatus: 'ai',
      serviceVersion: 0,
      assignedAgentId: null,
      assignedAgentName: null,
    });
    return { ...result, sessionToken };
  }

  async assertVisitor(sessionId: number, app: ExternalApp, token: unknown) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      throw new ForbiddenException('会话凭证无效，请新建会话');
    }
    const session = await this.sessions
      .createQueryBuilder('session')
      .addSelect('session.sessionTokenHash')
      .where('session.id = :sessionId', { sessionId })
      .andWhere('session.externalAppId = :appId', { appId: app.id })
      .getOne();
    const expected = session?.sessionTokenHash;
    const actual = this.hashToken(token);
    if (
      !expected ||
      expected.length !== actual.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
    ) {
      throw new ForbiddenException('会话凭证无效，请新建会话');
    }
    return session!;
  }

  async submitVisitorMessage(
    sessionId: number,
    app: ExternalApp,
    dto: SendCustomerMessageDto,
  ) {
    this.assertReady();
    this.validateMessage(dto);
    await this.withAppLock(app.id, async (manager) => {
      const session = await this.lockSession(manager, sessionId, app.id);
      const duplicate = await this.findDuplicate(
        manager,
        sessionId,
        dto,
        'user',
      );
      if (duplicate) return;
      if (session.serviceStatus === 'closed')
        throw new ConflictException('会话已结束，请新建会话');
      if (session.serviceStatus === 'ai') {
        const active = await this.activeTask(manager, sessionId);
        if (active)
          throw new ConflictException(
            '本会话已有排队或处理中的问题，请等待完成或取消',
          );
        const queueLength = await manager.count(CustomerChatTask, {
          where: { externalAppId: app.id, status: 'queued' },
        });
        if (queueLength >= QUEUE_LIMIT)
          throw new HttpException(
            '当前等待人数较多，请稍后再试或转人工',
            HttpStatus.TOO_MANY_REQUESTS,
          );
      }
      const message = await manager.save(
        CustomerChatMessage,
        manager.create(CustomerChatMessage, {
          sessionId,
          role: 'user',
          content: dto.content.trim(),
          clientMessageId: dto.clientMessageId,
          agentId: null,
          agentName: null,
          taskId: null,
        }),
      );
      if (session.serviceStatus === 'ai') {
        const task = await manager.save(
          CustomerChatTask,
          manager.create(CustomerChatTask, {
            externalAppId: app.id,
            sessionId,
            visitorMessageId: message.id,
            question: message.content,
            status: 'queued',
            sessionVersion: session.serviceVersion,
            answer: null,
            aiMessageId: null,
            failureReason: null,
            cancelReason: null,
            startedAt: null,
            finishedAt: null,
          }),
        );
        await manager.update(CustomerChatMessage, message.id, {
          taskId: task.id,
        });
      }
      await manager.update(KnowledgeAiChatSession, sessionId, {
        lastQuestion: message.content,
        ...(session.messageCount === 0
          ? { title: message.content.slice(0, 200) }
          : {}),
      });
    });
    this.schedule();
    return this.getSnapshot(sessionId);
  }

  async requestHuman(sessionId: number, app: ExternalApp) {
    this.assertReady();
    const cancelled = await this.withAppLock(app.id, async (manager) => {
      const session = await this.lockSession(manager, sessionId, app.id);
      if (session.serviceStatus === 'closed')
        throw new ConflictException('会话已结束，请新建会话');
      if (
        session.serviceStatus === 'human' ||
        session.serviceStatus === 'waiting_human'
      )
        return [];
      const ids = await this.cancelInTransaction(
        manager,
        sessionId,
        '访客请求人工客服',
      );
      await manager.update(KnowledgeAiChatSession, sessionId, {
        serviceStatus: 'waiting_human',
        assignedAgentId: null,
        assignedAgentName: null,
        serviceVersion: session.serviceVersion + 1,
      });
      await this.systemMessage(
        manager,
        sessionId,
        '已申请人工客服，请等待接入。',
      );
      return ids;
    });
    this.abortTasks(cancelled);
    this.schedule();
    return this.getSnapshot(sessionId);
  }

  async resumeAi(sessionId: number, app: ExternalApp) {
    this.assertReady();
    await this.withAppLock(app.id, async (manager) => {
      const session = await this.lockSession(manager, sessionId, app.id);
      if (session.serviceStatus === 'ai') return;
      if (session.serviceStatus !== 'waiting_human')
        throw new ConflictException('只有等待人工的会话可以取消申请并返回 AI');
      await manager.update(KnowledgeAiChatSession, sessionId, {
        serviceStatus: 'ai',
        serviceVersion: session.serviceVersion + 1,
      });
      await this.systemMessage(
        manager,
        sessionId,
        '已取消人工申请，返回 AI 服务。请重新发送需要 AI 回答的问题。',
      );
    });
    return this.getSnapshot(sessionId);
  }

  async cancelVisitorTask(sessionId: number, app: ExternalApp) {
    this.assertReady();
    const ids = await this.withAppLock(app.id, async (manager) => {
      const session = await this.lockSession(manager, sessionId, app.id);
      const active = await this.activeTask(manager, sessionId);
      if (!active || active.status === 'cancelling') return [];
      const ids = await this.cancelInTransaction(
        manager,
        sessionId,
        '访客取消 AI 问答',
      );
      await manager.update(KnowledgeAiChatSession, sessionId, {
        serviceVersion: session.serviceVersion + 1,
      });
      await this.systemMessage(
        manager,
        sessionId,
        '已取消本次 AI 问答，原问题已保留。',
        active.id,
      );
      return ids;
    });
    this.abortTasks(ids);
    this.schedule();
    return this.getSnapshot(sessionId);
  }

  async claimSession(sessionId: number, user: AuthUser) {
    this.assertReady();
    const existing = await this.requireManagedSession(sessionId);
    const ids = await this.withAppLock(
      existing.externalAppId!,
      async (manager) => {
        const session = await this.lockSession(
          manager,
          sessionId,
          existing.externalAppId!,
        );
        if (session.serviceStatus === 'closed')
          throw new ConflictException('会话已结束，不能接手');
        if (
          session.assignedAgentId === user.userId &&
          session.serviceStatus === 'human'
        )
          return [];
        if (
          session.assignedAgentId !== null &&
          session.assignedAgentId !== user.userId
        ) {
          throw new ConflictException('此会话已由其他客服接待');
        }
        const ids = await this.cancelInTransaction(
          manager,
          sessionId,
          '人工客服已接手',
        );
        await manager.update(KnowledgeAiChatSession, sessionId, {
          serviceStatus: 'human',
          assignedAgentId: user.userId,
          assignedAgentName: user.username,
          serviceVersion: session.serviceVersion + 1,
        });
        await this.systemMessage(
          manager,
          sessionId,
          `人工客服 ${user.username} 已接入。`,
        );
        return ids;
      },
    );
    this.abortTasks(ids);
    this.schedule();
    return this.getSnapshot(sessionId);
  }

  async sendAgentMessage(
    sessionId: number,
    dto: SendCustomerMessageDto,
    user: AuthUser,
  ) {
    this.assertReady();
    this.validateMessage(dto);
    const existing = await this.requireManagedSession(sessionId);
    await this.withAppLock(existing.externalAppId!, async (manager) => {
      const session = await this.lockSession(
        manager,
        sessionId,
        existing.externalAppId!,
      );
      if (
        await this.findDuplicate(manager, sessionId, dto, 'agent', user.userId)
      )
        return;
      this.assertAssigned(session, user);
      await manager.save(
        CustomerChatMessage,
        manager.create(CustomerChatMessage, {
          sessionId,
          role: 'agent',
          content: dto.content.trim(),
          clientMessageId: dto.clientMessageId,
          agentId: user.userId,
          agentName: user.username,
          taskId: null,
        }),
      );
      await manager.update(KnowledgeAiChatSession, sessionId, {
        lastAnswer: dto.content.trim(),
      });
    });
    return this.getSnapshot(sessionId);
  }

  async closeSession(sessionId: number, user: AuthUser) {
    this.assertReady();
    const existing = await this.requireManagedSession(sessionId);
    const ids = await this.withAppLock(
      existing.externalAppId!,
      async (manager) => {
        const session = await this.lockSession(
          manager,
          sessionId,
          existing.externalAppId!,
        );
        if (
          session.serviceStatus === 'closed' &&
          session.assignedAgentId === user.userId
        )
          return [];
        this.assertAssigned(session, user);
        const ids = await this.cancelInTransaction(
          manager,
          sessionId,
          '客服结束接待',
        );
        await manager.update(KnowledgeAiChatSession, sessionId, {
          serviceStatus: 'closed',
          serviceVersion: session.serviceVersion + 1,
        });
        await this.systemMessage(
          manager,
          sessionId,
          `客服 ${user.username} 已结束接待。如需继续咨询，请新建会话。`,
        );
        return ids;
      },
      true,
    );
    this.abortTasks(ids);
    this.schedule();
    return this.getSnapshot(sessionId);
  }

  async findSessions(query: QueryCustomerSessionsDto, user: AuthUser) {
    const builder = this.sessions
      .createQueryBuilder('session')
      .where('session.externalAppId IS NOT NULL');
    if (query.externalAppId)
      builder.andWhere('session.externalAppId = :appId', {
        appId: query.externalAppId,
      });
    if (query.serviceStatus)
      builder.andWhere('session.serviceStatus = :serviceStatus', {
        serviceStatus: query.serviceStatus,
      });
    if (query.mine)
      builder.andWhere('session.assignedAgentId = :agentId', {
        agentId: user.userId,
      });
    if (query.keyword?.trim())
      builder.andWhere(
        '(session.title LIKE :keyword OR session.lastQuestion LIKE :keyword OR CAST(session.id AS CHAR) = :id)',
        {
          keyword: `%${query.keyword.trim()}%`,
          id: query.keyword.trim(),
        },
      );
    if (query.taskStatus)
      builder.andWhere(
        `EXISTS (SELECT 1 FROM customer_chat_tasks task WHERE task.sessionId = session.id AND task.deletedAt IS NULL AND task.status IN (:...taskStatuses))`,
        {
          taskStatuses:
            query.taskStatus === 'running'
              ? ['running', 'cancelling']
              : ['queued'],
        },
      );
    const [sessions, total] = await builder
      .orderBy('session.updatedAt', 'DESC')
      .addOrderBy('session.id', 'DESC')
      .skip(((query.page ?? 1) - 1) * (query.pageSize ?? 20))
      .take(query.pageSize ?? 20)
      .getManyAndCount();
    return {
      list: await Promise.all(
        sessions.map((session) =>
          this.getSnapshot(session.id, undefined, true),
        ),
      ),
      total,
    };
  }

  async findApps() {
    const apps = await this.apps.find({
      select: { id: true, name: true },
      order: { name: 'ASC', id: 'ASC' },
    });
    return apps.map(({ id, name }) => ({ id, name }));
  }

  async getSnapshot(
    sessionId: number,
    beforeMessageId?: number,
    withoutMessages = false,
    readAttempt = 0,
  ): Promise<CustomerSessionSnapshot> {
    const session = await this.requireManagedSession(sessionId);
    const [app, task, messages] = await Promise.all([
      this.apps.findOne({
        where: { id: session.externalAppId! },
        withDeleted: true,
      }),
      this.tasks.findOne({
        where: { sessionId, status: In([...ACTIVE_STATUSES]) },
        order: { id: 'DESC' },
      }),
      withoutMessages
        ? Promise.resolve([])
        : this.messages.find({
            where: {
              sessionId,
              ...(beforeMessageId ? { id: LessThan(beforeMessageId) } : {}),
            },
            order: { id: 'DESC' },
            take: HISTORY_PAGE_SIZE + 1,
          }),
    ]);
    const hasMoreMessages = messages.length > HISTORY_PAGE_SIZE;
    const page = messages.slice(0, HISTORY_PAGE_SIZE).reverse();
    const queuePosition =
      task?.status === 'queued'
        ? (await this.tasks.count({
            where: {
              externalAppId: task.externalAppId,
              status: 'queued',
              id: LessThan(task.id),
            },
          })) + 1
        : null;
    // 详情由多个只读查询组成，接待切换或任务完成穿插时重读，避免拼出“人工状态+旧 AI 任务”。
    const [latestSession, latestTask] = await Promise.all([
      this.requireManagedSession(sessionId),
      this.tasks.findOne({
        where: { sessionId, status: In([...ACTIVE_STATUSES]) },
        order: { id: 'DESC' },
      }),
    ]);
    if (
      latestSession.serviceVersion !== session.serviceVersion ||
      latestTask?.id !== task?.id ||
      latestTask?.status !== task?.status
    ) {
      if (readAttempt >= 2)
        throw new ConflictException('会话状态正在变化，请重试');
      return this.getSnapshot(
        sessionId,
        beforeMessageId,
        withoutMessages,
        readAttempt + 1,
      );
    }
    return {
      sessionId,
      title: session.title,
      externalAppId: session.externalAppId!,
      appName: app?.name ?? '已删除应用',
      serviceStatus: session.serviceStatus,
      serviceVersion: session.serviceVersion,
      assignedAgentId: session.assignedAgentId,
      assignedAgentName: session.assignedAgentName,
      queuePosition,
      activeTask: task
        ? {
            id: task.id,
            status: task.status as 'queued' | 'running' | 'cancelling',
            answer:
              task.status === 'running' && session.serviceStatus === 'ai'
                ? (this.running.get(task.id)?.answer ?? task.answer ?? '')
                : '',
          }
        : null,
      messages: page.map(
        ({
          id,
          sessionId: messageSessionId,
          role,
          content,
          createdAt,
          agentName,
          clientMessageId,
          taskId,
        }) => ({
          id,
          sessionId: messageSessionId,
          role,
          content,
          createdAt,
          agentName,
          clientMessageId,
          taskId,
        }),
      ),
      hasMoreMessages,
      nextBeforeMessageId: hasMoreMessages ? (page[0]?.id ?? null) : null,
      updatedAt: session.updatedAt,
    };
  }

  /** 只发送变化快照；连接关闭仅取消订阅，不等于取消持久化任务。 */
  subscribe(
    sessionId: number,
    write: (event: string, data: unknown) => void,
    end?: () => void,
  ) {
    let closed = false;
    let polling = false;
    let lastSnapshot = '';
    const poll = async () => {
      if (closed || polling) return;
      polling = true;
      try {
        const snapshot = await this.getSnapshot(sessionId);
        const serialized = JSON.stringify(snapshot);
        if (!closed && serialized !== lastSnapshot) {
          lastSnapshot = serialized;
          write('snapshot', snapshot);
        }
      } catch (error) {
        if (!closed) {
          write('error', {
            message:
              error instanceof NotFoundException
                ? '会话不存在或已删除'
                : '会话同步失败，请重新连接',
          });
          cleanup();
          end?.();
        }
      } finally {
        polling = false;
      }
    };
    const eventListener = (data: unknown) => {
      if (!closed) write('ai-event', data);
    };
    const shutdownListener = () => {
      cleanup();
      end?.();
    };
    const interval = setInterval(() => {
      void poll();
    }, 1000);
    const heartbeat = setInterval(() => {
      if (!closed) write('heartbeat', { timestamp: Date.now() });
    }, 15_000);
    interval.unref();
    heartbeat.unref();
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(interval);
      clearInterval(heartbeat);
      this.events.off(`session:${sessionId}`, eventListener);
      this.events.off('shutdown', shutdownListener);
    };
    this.events.on(`session:${sessionId}`, eventListener);
    this.events.on('shutdown', shutdownListener);
    void poll();
    return cleanup;
  }

  async findTaskForMessage(sessionId: number, clientMessageId: string) {
    const message = await this.messages.findOneBy({
      sessionId,
      clientMessageId,
    });
    return message?.taskId
      ? this.tasks.findOneBy({ id: message.taskId })
      : null;
  }

  private schedule() {
    if (this.stopping || this.draining || !this.ready) return;
    const pending = this.drain();
    this.drainPromise = pending;
    void pending
      .catch((error: unknown) =>
        this.logger.error(
          '客服队列调度失败',
          error instanceof Error ? error.stack : String(error),
        ),
      )
      .finally(() => {
        if (this.drainPromise === pending) this.drainPromise = undefined;
      });
  }

  private async drain() {
    this.draining = true;
    try {
      if (this.lockRunner) {
        try {
          const rows: Array<{ ownsLock: number }> = await this.lockRunner.query(
            "SELECT IS_USED_LOCK(SHA2(CONCAT(DATABASE(), ':customer-service-dispatch'), 256)) = CONNECTION_ID() AS ownsLock",
          );
          if (Number(rows[0]?.ownsLock) !== 1)
            throw new Error('客服调度锁已失效');
        } catch (error) {
          this.ready = false;
          for (const task of this.running.values()) {
            task.publishAllowed = false;
            task.controller.abort(new Error('客服调度锁已失效，请重启服务'));
          }
          throw error;
        }
      }
      // AI 已结束但落库短暂失败的任务只重试收尾，绝不重新调用模型。
      for (const taskId of this.pendingFinalizers.keys())
        await this.finishTask(taskId);
      const queued = await this.tasks
        .createQueryBuilder('task')
        .select('DISTINCT task.externalAppId', 'externalAppId')
        .where('task.status = :status', { status: 'queued' })
        .getRawMany<{ externalAppId: number }>();
      for (const { externalAppId } of queued) {
        if (this.stopping) break;
        const tasks = await this.takeTasks(Number(externalAppId));
        for (const task of tasks) {
          const state: RunningTask = {
            controller: new AbortController(),
            publishAllowed: true,
            answer: '',
          };
          if (this.stopping) {
            state.publishAllowed = false;
            state.controller.abort(new Error('服务正在关闭'));
          }
          this.running.set(task.id, state);
          const execution = this.execute(task, state).catch((error: unknown) =>
            this.logger.error(
              '客服任务收尾失败，将保留占位等待恢复',
              error instanceof Error ? error.stack : String(error),
            ),
          );
          this.executions.add(execution);
          void execution.finally(() => this.executions.delete(execution));
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private async takeTasks(appId: number) {
    return this.withAppLock(
      appId,
      async (manager, app) => {
        const queue = await manager.find(CustomerChatTask, {
          where: { externalAppId: appId, status: 'queued' },
          order: { id: 'ASC' },
        });
        const occupied = await manager.count(CustomerChatTask, {
          where: {
            externalAppId: appId,
            status: In(['running', 'cancelling']),
          },
        });
        let available = app?.isEnabled
          ? Math.max(0, (app.maxConcurrentChats ?? Infinity) - occupied)
          : 0;
        const selected: CustomerChatTask[] = [];
        for (const task of queue) {
          const session = await manager.findOneBy(KnowledgeAiChatSession, {
            id: task.sessionId,
          });
          const expired =
            Date.now() - task.createdAt.getTime() >= QUEUE_TIMEOUT_MS;
          if (
            !app?.isEnabled ||
            !session ||
            session.serviceStatus !== 'ai' ||
            session.serviceVersion !== task.sessionVersion ||
            expired
          ) {
            await manager.update(CustomerChatTask, task.id, {
              status: expired ? 'expired' : 'cancelled',
              finishedAt: new Date(),
              cancelReason: expired
                ? '等待 AI 超过 15 分钟'
                : '应用停用或接待状态已变化',
            });
            if (session)
              await this.systemMessage(
                manager,
                task.sessionId,
                expired
                  ? '等待 AI 已超时，请重试或转人工。'
                  : '本次 AI 排队已取消。',
                task.id,
              );
            continue;
          }
          if (available <= 0) continue;
          task.status = 'running';
          task.startedAt = new Date();
          await manager.update(CustomerChatTask, task.id, {
            status: task.status,
            startedAt: task.startedAt,
          });
          selected.push(task);
          available--;
        }
        return selected;
      },
      true,
    );
  }

  private async execute(task: CustomerChatTask, state: RunningTask) {
    let finalData: Record<string, unknown> | undefined;
    let failure: unknown;
    let checkpointAt = 0;
    let checkpoint = Promise.resolve();
    let timeoutCheckpoint = Promise.resolve();
    const timeout = setTimeout(() => {
      state.publishAllowed = false;
      state.controller.abort(new Error('AI 处理超过 180 秒'));
      timeoutCheckpoint = this.markTimedOut(task).catch((error: unknown) =>
        this.logger.error('标记 AI 超时失败', String(error)),
      );
    }, EXECUTION_TIMEOUT_MS);
    timeout.unref();
    try {
      if (this.stopping || state.controller.signal.aborted)
        throw new Error('服务正在关闭或任务已取消');
      const app = await this.apps.findOneBy({
        id: task.externalAppId,
        isEnabled: true,
      });
      const current = await this.tasks.findOneBy({ id: task.id });
      const session = await this.sessions.findOneBy({ id: task.sessionId });
      if (
        !app ||
        current?.status !== 'running' ||
        session?.serviceStatus !== 'ai' ||
        session.serviceVersion !== task.sessionVersion
      ) {
        state.publishAllowed = false;
        throw new Error('接待状态已变化');
      }
      await this.ai.askStream(
        { sessionId: task.sessionId, question: task.question },
        {
          writeEvent: (event, data) => {
            if (!state.publishAllowed || state.controller.signal.aborted)
              return;
            const payload =
              data && typeof data === 'object'
                ? (data as Record<string, unknown>)
                : {};
            if (event === 'done' || event === 'error') {
              finalData = payload;
              if (event === 'error')
                failure = new Error(
                  typeof payload.message === 'string'
                    ? payload.message
                    : 'AI 回答失败',
                );
              return;
            }
            if (event === 'delta' && typeof payload.content === 'string') {
              state.answer += payload.content;
              if (Date.now() - checkpointAt > 1000) {
                checkpointAt = Date.now();
                const answer = state.answer;
                checkpoint = checkpoint
                  .then(async () => {
                    await this.tasks.update(
                      { id: task.id, status: 'running' },
                      { answer },
                    );
                  })
                  .catch((error: unknown) =>
                    this.logger.warn(`保存 AI 片段失败：${String(error)}`),
                  );
              }
            }
            this.events.emit(`session:${task.sessionId}`, {
              taskId: task.id,
              event,
              data,
            });
          },
        },
        app,
        {
          signal: state.controller.signal,
          isCurrent: () =>
            state.publishAllowed && !state.controller.signal.aborted,
        },
      );
      if (!finalData && state.publishAllowed)
        failure = new Error('AI 未返回完成结果');
    } catch (error) {
      failure = error;
    } finally {
      clearTimeout(timeout);
    }
    await checkpoint;
    await timeoutCheckpoint;
    const finish = async () => {
      await this.withAppLock(
        task.externalAppId,
        async (manager) => {
          const current = await manager.findOneBy(CustomerChatTask, {
            id: task.id,
          });
          const session = await manager.findOneBy(KnowledgeAiChatSession, {
            id: task.sessionId,
          });
          if (!current || !['running', 'cancelling'].includes(current.status))
            return;
          const cancelled =
            !state.publishAllowed ||
            state.controller.signal.aborted ||
            current.status === 'cancelling' ||
            !session ||
            session.serviceStatus !== 'ai' ||
            session.serviceVersion !== task.sessionVersion;
          const answer =
            typeof finalData?.answer === 'string'
              ? finalData.answer
              : state.answer;
          await manager.update(CustomerChatTask, task.id, {
            status: cancelled ? 'cancelled' : failure ? 'failed' : 'completed',
            answer: cancelled ? null : answer,
            finishedAt: new Date(),
            aiMessageId:
              typeof finalData?.messageId === 'number'
                ? finalData.messageId
                : null,
            failureReason:
              failure instanceof Error ? failure.message.slice(0, 2000) : null,
          });
          if (!cancelled && !failure) {
            await manager.save(
              CustomerChatMessage,
              manager.create(CustomerChatMessage, {
                sessionId: task.sessionId,
                role: 'ai',
                content: answer,
                taskId: task.id,
                clientMessageId: null,
                agentId: null,
                agentName: null,
              }),
            );
          } else if (!cancelled && failure && session) {
            await this.systemMessage(
              manager,
              task.sessionId,
              'AI 暂时无法回答，请重试或转人工。',
              task.id,
            );
          }
        },
        true,
      );
    };
    this.pendingFinalizers.set(task.id, { sessionId: task.sessionId, finish });
    try {
      await this.finishTask(task.id);
    } catch (error) {
      this.logger.error(
        'AI 已结束但结果落库失败，保留占位并由调度器重试收尾',
        error instanceof Error ? error.stack : String(error),
      );
    }
    this.schedule();
  }

  private async finishTask(taskId: number) {
    const pending = this.pendingFinalizers.get(taskId);
    if (!pending || this.finishing.has(taskId)) return;
    this.finishing.add(taskId);
    try {
      await pending.finish();
      this.pendingFinalizers.delete(taskId);
      this.running.delete(taskId);
      this.events.emit(`session:${pending.sessionId}`, {
        taskId,
        event: 'task-settled',
        data: { taskId },
      });
    } finally {
      this.finishing.delete(taskId);
    }
  }

  private async markTimedOut(task: CustomerChatTask) {
    await this.withAppLock(
      task.externalAppId,
      async (manager) => {
        const current = await manager.findOneBy(CustomerChatTask, {
          id: task.id,
        });
        if (current?.status !== 'running') return;
        await manager.update(CustomerChatTask, task.id, {
          status: 'cancelling',
          cancelReason: 'AI 处理超时',
        });
        const session = await manager.findOneBy(KnowledgeAiChatSession, {
          id: task.sessionId,
        });
        if (session)
          await this.systemMessage(
            manager,
            task.sessionId,
            'AI 处理超时，正在终止本次任务，请稍后重试或转人工。',
            task.id,
          );
      },
      true,
    );
  }

  private async withAppLock<T>(
    appId: number,
    action: (manager: EntityManager, app: ExternalApp | null) => Promise<T>,
    allowDisabled = false,
  ) {
    return this.dataSource.transaction(async (manager) => {
      // 所有修改统一 app → session → task 的锁顺序，避免领取与接手互相死锁。
      const app = await manager.findOne(ExternalApp, {
        where: { id: appId },
        withDeleted: true,
        lock: { mode: 'pessimistic_write' },
      });
      if (!allowDisabled && (!app || !app.isEnabled || app.deletedAt))
        throw new ForbiddenException('应用不存在或已停用');
      return action(manager, app?.deletedAt ? null : app);
    });
  }

  private async lockSession(
    manager: EntityManager,
    id: number,
    externalAppId: number,
  ) {
    const session = await manager.findOne(KnowledgeAiChatSession, {
      where: { id, externalAppId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!session) throw new NotFoundException('会话不存在');
    return session;
  }

  private async requireManagedSession(id: number) {
    const session = await this.sessions.findOneBy({ id });
    if (!session || !session.externalAppId)
      throw new NotFoundException('客服会话不存在');
    return session;
  }

  private activeTask(manager: EntityManager, sessionId: number) {
    return manager.findOne(CustomerChatTask, {
      where: { sessionId, status: In([...ACTIVE_STATUSES]) },
    });
  }

  private async cancelInTransaction(
    manager: EntityManager,
    sessionId: number,
    reason: string,
  ) {
    const active = await manager.find(CustomerChatTask, {
      where: { sessionId, status: In([...ACTIVE_STATUSES]) },
    });
    for (const task of active) {
      await manager.update(CustomerChatTask, task.id, {
        status: task.status === 'queued' ? 'cancelled' : 'cancelling',
        cancelReason: reason,
        ...(task.status === 'queued' ? { finishedAt: new Date() } : {}),
      });
    }
    return active.map((task) => task.id);
  }

  private abortTasks(ids: number[]) {
    for (const id of ids) {
      const running = this.running.get(id);
      if (running) {
        running.publishAllowed = false;
        running.controller.abort(new Error('AI 任务已取消或转人工'));
      }
    }
  }

  private assertAssigned(session: KnowledgeAiChatSession, user: AuthUser) {
    if (
      session.serviceStatus !== 'human' ||
      session.assignedAgentId !== user.userId
    ) {
      throw new ForbiddenException(
        '请先接手此会话，仅接待中的指定客服可以操作',
      );
    }
  }

  private validateMessage(dto: SendCustomerMessageDto) {
    if (
      !/^[A-Za-z0-9_-]{8,64}$/.test(dto.clientMessageId ?? '') ||
      !dto.content?.trim() ||
      dto.content.length > 10000
    ) {
      throw new BadRequestException('消息内容或请求标识无效');
    }
  }

  private async findDuplicate(
    manager: EntityManager,
    sessionId: number,
    dto: SendCustomerMessageDto,
    role: CustomerChatMessage['role'],
    agentId?: number,
  ) {
    const message = await manager.findOneBy(CustomerChatMessage, {
      sessionId,
      clientMessageId: dto.clientMessageId,
    });
    if (
      message &&
      (message.content !== dto.content.trim() ||
        message.role !== role ||
        (role === 'agent' && message.agentId !== agentId))
    ) {
      throw new ConflictException('同一个消息请求标识不能用于不同内容');
    }
    return message;
  }

  private async systemMessage(
    manager: EntityManager,
    sessionId: number,
    content: string,
    taskId: number | null = null,
  ) {
    await manager.save(
      CustomerChatMessage,
      manager.create(CustomerChatMessage, {
        sessionId,
        role: 'system',
        content,
        taskId,
        agentId: null,
        agentName: null,
        clientMessageId: null,
      }),
    );
    await manager.update(KnowledgeAiChatSession, sessionId, {
      updatedAt: new Date(),
    });
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private assertReady() {
    if (!this.ready || this.stopping)
      throw new ServiceUnavailableException(
        '客服服务正在初始化或恢复，请稍后重试',
      );
  }
}
