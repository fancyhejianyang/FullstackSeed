import { createHash } from 'node:crypto';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource, FindOperator, QueryRunner, Repository } from 'typeorm';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { ExternalApp } from '../external-apps/entities/external-app.entity';
import { KnowledgeAiChatSession } from '../knowledge-ai-chat/entities/knowledge-ai-chat-session.entity';
import { KnowledgeAiChatService } from '../knowledge-ai-chat/knowledge-ai-chat.service';
import { CustomerChatTask } from './entities/customer-chat-task.entity';
import { CustomerChatMessage } from './entities/customer-chat-message.entity';
import { CustomerServiceService } from './customer-service.service';
import type { CustomerSessionSnapshot } from './customer-service.service';

type Row = Record<string, unknown>;
type FindOptions = {
  where?: Row;
  order?: Record<string, 'ASC' | 'DESC'>;
  take?: number;
};

function fixture() {
  const stores = new Map<Function, Row[]>([
    [ExternalApp, []],
    [KnowledgeAiChatSession, []],
    [CustomerChatTask, []],
    [CustomerChatMessage, []],
  ]);
  const rows = (entity: Function) => stores.get(entity)!;
  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([key, value]) => {
      if (value instanceof FindOperator) {
        if (value.type === 'in')
          return (value.value as unknown[]).includes(row[key]);
        if (value.type === 'lessThan')
          return Number(row[key]) < Number(value.value);
      }
      return row[key] === value;
    });
  const find = async (entity: Function, options: FindOptions = {}) => {
    let result = rows(entity)
      .filter((row) => !row.deletedAt && matches(row, options.where))
      .map((row) => ({ ...row }));
    if (options.order) {
      const [field, direction] = Object.entries(options.order)[0];
      result = result.sort(
        (a, b) =>
          (Number(a[field]) - Number(b[field])) *
          (direction === 'ASC' ? 1 : -1),
      );
    }
    return options.take ? result.slice(0, options.take) : result;
  };
  const manager = {
    find,
    findOne: async (entity: Function, options: FindOptions) =>
      (await find(entity, options))[0] ?? null,
    findOneBy: async (entity: Function, where: Row) =>
      (await find(entity, { where }))[0] ?? null,
    count: async (entity: Function, options: FindOptions) =>
      (await find(entity, options)).length,
    create: (_entity: Function, value: Row) => value,
    save: async (entity: Function, value: Row) => {
      const saved = {
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ...value,
        id: value.id ?? rows(entity).length + 1,
      };
      rows(entity).push(saved);
      return { ...saved };
    },
    update: async (entity: Function, criteria: number | Row, patch: Row) => {
      for (const row of rows(entity)) {
        if (
          matches(
            row,
            typeof criteria === 'number' ? { id: criteria } : criteria,
          )
        )
          Object.assign(row, patch, { updatedAt: new Date() });
      }
      return { affected: 1 };
    },
  };
  let transactionTail = Promise.resolve();
  const source = {
    transaction: <T>(
      action: (value: typeof manager) => Promise<T>,
    ): Promise<T> => {
      // 模拟应用行锁的串行事务，验证业务状态机，不替代真实 MySQL 锁集成测试。
      const result = transactionTail.then(() => action(manager));
      transactionTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
  function repo<T extends object>(entity: new () => T): Repository<T> {
    return {
      find: (options: FindOptions) => find(entity, options),
      findOne: (options: FindOptions) => manager.findOne(entity, options),
      findOneBy: (where: Row) => manager.findOneBy(entity, where),
      count: (options: FindOptions) => manager.count(entity, options),
      update: (criteria: number | Row, patch: Row) =>
        manager.update(entity, criteria, patch),
    } as unknown as Repository<T>;
  }
  function insert<T extends object>(entity: new () => T, value: Partial<T>): T {
    const row = {
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...value,
      id: (value as { id?: number }).id ?? rows(entity).length + 1,
    };
    rows(entity).push(row);
    return row as T;
  }
  const ai = { askStream: jest.fn(), initSession: jest.fn() };
  const sessionRepo = repo(KnowledgeAiChatSession);
  const service = new CustomerServiceService(
    source as unknown as DataSource,
    sessionRepo,
    repo(CustomerChatTask),
    repo(CustomerChatMessage),
    repo(ExternalApp),
    ai as unknown as KnowledgeAiChatService,
  );
  service['ready'] = true;
  const schedule = jest
    .spyOn(service as unknown as { schedule(): void }, 'schedule')
    .mockImplementation(() => undefined);
  const app = insert(ExternalApp, {
    id: 1,
    name: '测试应用',
    isEnabled: true,
    maxConcurrentChats: 1,
  });
  const session = (id: number, appId = 1) =>
    insert(KnowledgeAiChatSession, {
      id,
      externalAppId: appId,
      title: `会话 ${id}`,
      serviceStatus: 'ai',
      serviceVersion: 0,
      assignedAgentId: null,
      assignedAgentName: null,
      messageCount: 0,
    });
  const task = (sessionId: number, values: Partial<CustomerChatTask> = {}) =>
    insert(CustomerChatTask, {
      externalAppId: 1,
      sessionId,
      visitorMessageId: 1,
      question: '卷尺有哪些规格？',
      status: 'queued',
      sessionVersion: 0,
      answer: null,
      ...values,
    });
  const snapshot = jest
    .spyOn(service, 'getSnapshot')
    .mockImplementation(
      async (id) => ({ sessionId: id }) as CustomerSessionSnapshot,
    );
  return {
    service,
    ai,
    app,
    session,
    task,
    insert,
    rows,
    manager,
    schedule,
    snapshot,
    sessionRepo,
  };
}

const agent = (userId = 10): AuthUser => ({
  userId,
  username: `客服${userId}`,
  isAdmin: false,
  roles: [],
  permissions: [],
});
const message = (
  clientMessageId = 'request_001',
  content = '请问有靠枕吗？',
) => ({ clientMessageId, content });

describe('CustomerServiceService 接待调度', () => {
  it('按应用限额领取 FIFO，任务完成释放后领取下一条', async () => {
    const f = fixture();
    f.session(1);
    f.session(2);
    const first = f.task(1);
    const second = f.task(2);
    expect((await f.service['takeTasks'](1)).map((task) => task.id)).toEqual([
      first.id,
    ]);
    expect(await f.service['takeTasks'](1)).toEqual([]);
    await f.manager.update(CustomerChatTask, first.id, { status: 'completed' });
    expect((await f.service['takeTasks'](1)).map((task) => task.id)).toEqual([
      second.id,
    ]);
  });

  it('取消中的真实执行仍占名额；不同应用互不占用', async () => {
    const f = fixture();
    f.session(1);
    f.session(2);
    f.session(3, 2);
    f.insert(ExternalApp, {
      id: 2,
      name: '第二应用',
      isEnabled: true,
      maxConcurrentChats: 1,
    });
    f.task(1, { status: 'cancelling' });
    f.task(2);
    const other = f.task(3, { externalAppId: 2 });
    expect(await f.service['takeTasks'](1)).toEqual([]);
    expect((await f.service['takeTasks'](2)).map((task) => task.id)).toEqual([
      other.id,
    ]);
  });

  it('未配置并发不隐式按 200 限制执行数量', async () => {
    const f = fixture();
    f.app.maxConcurrentChats = null;
    f.session(1);
    for (let index = 0; index < 201; index++)
      f.task(1000 + index, { status: 'running' });
    const queued = f.task(1);
    expect((await f.service['takeTasks'](1)).map((task) => task.id)).toEqual([
      queued.id,
    ]);
  });

  it('过期队列和已停用应用不会进入模型执行', async () => {
    const f = fixture();
    f.session(1);
    f.session(2);
    const expired = f.task(1, {
      createdAt: new Date(Date.now() - 16 * 60_000),
    });
    expect(await f.service['takeTasks'](1)).toEqual([]);
    expect(
      f.rows(CustomerChatTask).find((task) => task.id === expired.id)?.status,
    ).toBe('expired');
    f.app.isEnabled = false;
    const disabled = f.task(2);
    expect(await f.service['takeTasks'](1)).toEqual([]);
    expect(
      f.rows(CustomerChatTask).find((task) => task.id === disabled.id)?.status,
    ).toBe('cancelled');
    expect(f.ai.askStream).not.toHaveBeenCalled();
  });

  it('访客同消息重试不重复入队，不同内容复用标识冲突', async () => {
    const f = fixture();
    f.session(1);
    await Promise.all([
      f.service.submitVisitorMessage(1, f.app, message()),
      f.service.submitVisitorMessage(1, f.app, message()),
    ]);
    expect(f.rows(CustomerChatMessage)).toHaveLength(1);
    expect(f.rows(CustomerChatTask)).toHaveLength(1);
    await expect(
      f.service.submitVisitorMessage(
        1,
        f.app,
        message('request_001', '不同问题'),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      f.service.submitVisitorMessage(1, f.app, message('request_002')),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(f.rows(CustomerChatMessage)).toHaveLength(1);
  });

  it('同一应用队列满 200 时拒绝新增，不产生半条消息', async () => {
    const f = fixture();
    f.session(1);
    for (let index = 0; index < 200; index++) f.task(index + 1000);
    await expect(
      f.service.submitVisitorMessage(1, f.app, message()),
    ).rejects.toMatchObject({ status: 429 });
    expect(f.rows(CustomerChatMessage)).toHaveLength(0);
  });

  it('两名客服竞争仅一名成功，同客服重复接手幂等且撤销排队', async () => {
    const f = fixture();
    f.session(1);
    const task = f.task(1);
    const results = await Promise.allSettled([
      f.service.claimSession(1, agent(10)),
      f.service.claimSession(1, agent(11)),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(f.rows(KnowledgeAiChatSession)[0]).toMatchObject({
      serviceStatus: 'human',
      assignedAgentId: 10,
      serviceVersion: 1,
    });
    expect(
      f.rows(CustomerChatTask).find((row) => row.id === task.id)?.status,
    ).toBe('cancelled');
    await f.service.claimSession(1, agent(10));
    expect(f.rows(CustomerChatMessage)).toHaveLength(1);
    expect(await f.service['takeTasks'](1)).toEqual([]);
  });

  it('转人工使运行任务进入 cancelling 并 abort，完成之前不释放容量', async () => {
    const f = fixture();
    f.session(1);
    f.session(2);
    const running = f.task(1, { status: 'running' });
    f.task(2);
    const state = {
      controller: new AbortController(),
      publishAllowed: true,
      answer: '已生成一部分',
    };
    f.service['running'].set(running.id, state);
    await f.service.requestHuman(1, f.app);
    expect(state.controller.signal.aborted).toBe(true);
    expect(state.publishAllowed).toBe(false);
    expect(
      f.rows(CustomerChatTask).find((row) => row.id === running.id)?.status,
    ).toBe('cancelling');
    expect(await f.service['takeTasks'](1)).toEqual([]);
    expect(f.rows(KnowledgeAiChatSession)[0].serviceStatus).toBe(
      'waiting_human',
    );
  });

  it('重复取消幂等，恢复 AI 不自动重放撤销的问题', async () => {
    const f = fixture();
    f.session(1);
    f.task(1);
    await f.service.requestHuman(1, f.app);
    await f.service.requestHuman(1, f.app);
    expect(f.rows(CustomerChatMessage)).toHaveLength(1);
    await f.service.resumeAi(1, f.app);
    expect(f.rows(KnowledgeAiChatSession)[0].serviceStatus).toBe('ai');
    expect(f.rows(CustomerChatTask)).toHaveLength(1);
    expect(f.rows(CustomerChatTask)[0].status).toBe('cancelled');
  });

  it('等待人工和人工聊天不创建 AI 任务，只有接待客服能发送和结束', async () => {
    const f = fixture();
    f.session(1);
    await f.service.requestHuman(1, f.app);
    await f.service.submitVisitorMessage(1, f.app, message());
    expect(f.rows(CustomerChatTask)).toHaveLength(0);
    await f.service.claimSession(1, agent(10));
    await expect(
      f.service.sendAgentMessage(1, message('agent_001'), agent(11)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(f.service.closeSession(1, agent(11))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await f.service.sendAgentMessage(
      1,
      message('agent_001', '您好'),
      agent(10),
    );
    await f.service.closeSession(1, agent(10));
    const count = f.rows(CustomerChatMessage).length;
    await f.service.sendAgentMessage(
      1,
      message('agent_001', '您好'),
      agent(10),
    );
    expect(f.rows(CustomerChatMessage)).toHaveLength(count);
    await expect(
      f.service.submitVisitorMessage(1, f.app, message('request_002')),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('AI 最终结果写入聊天记录后才标记完成', async () => {
    const f = fixture();
    f.session(1);
    const task = f.task(1, { status: 'running' });
    f.ai.askStream.mockImplementation(
      async (
        _dto: unknown,
        writer: { writeEvent: (event: string, data: unknown) => void },
      ) => {
        writer.writeEvent('delta', { content: '靠枕有三款。' });
        writer.writeEvent('done', {
          answer: '靠枕有三款。',
          messageId: 50,
          isSuccess: true,
        });
      },
    );
    const state = {
      controller: new AbortController(),
      publishAllowed: true,
      answer: '',
    };
    f.service['running'].set(task.id, state);
    await f.service['execute'](task, state);
    expect(f.rows(CustomerChatTask)[0]).toMatchObject({
      status: 'completed',
      aiMessageId: 50,
    });
    expect(f.rows(CustomerChatMessage)).toEqual([
      expect.objectContaining({
        role: 'ai',
        content: '靠枕有三款。',
        taskId: task.id,
      }),
    ]);
    expect(f.service['running'].size).toBe(0);
  });

  it('AI 收尾与人工接手竞态不会发布迟到的 AI 回答', async () => {
    const f = fixture();
    f.session(1);
    const task = f.task(1, { status: 'running' });
    f.ai.askStream.mockImplementation(
      async (
        _dto: unknown,
        writer: { writeEvent: (event: string, data: unknown) => void },
      ) => {
        await f.service.claimSession(1, agent());
        writer.writeEvent('delta', { content: '不应该出现' });
        writer.writeEvent('done', { answer: '不应该出现', messageId: 50 });
      },
    );
    const state = {
      controller: new AbortController(),
      publishAllowed: true,
      answer: '',
    };
    f.service['running'].set(task.id, state);
    await f.service['execute'](task, state);
    expect(f.rows(CustomerChatTask)[0].status).toBe('cancelled');
    expect(f.rows(CustomerChatMessage).some((row) => row.role === 'ai')).toBe(
      false,
    );
    expect(state.answer).toBe('');
  });

  it('AI 完成后的短暂数据库失败只重试收尾，不永久占位也不重复调用模型', async () => {
    const f = fixture();
    f.session(1);
    const task = f.task(1, { status: 'running' });
    f.ai.askStream.mockImplementation(
      async (
        _dto: unknown,
        writer: { writeEvent: (event: string, data: unknown) => void },
      ) => {
        writer.writeEvent('done', {
          answer: '正常答案',
          messageId: 80,
          isSuccess: true,
        });
      },
    );
    const transaction = jest
      .spyOn(
        f.service as unknown as { withAppLock(): Promise<void> },
        'withAppLock',
      )
      .mockRejectedValueOnce(new Error('模拟短暂数据库连接中断'));
    const log = jest
      .spyOn(f.service['logger'], 'error')
      .mockImplementation(() => undefined);
    const state = {
      controller: new AbortController(),
      publishAllowed: true,
      answer: '',
    };
    f.service['running'].set(task.id, state);
    await f.service['execute'](task, state);
    expect(f.rows(CustomerChatTask)[0].status).toBe('running');
    expect(f.service['pendingFinalizers'].size).toBe(1);
    expect(f.service['running'].size).toBe(1);
    transaction.mockRestore();
    await f.service['finishTask'](task.id);
    await f.service['finishTask'](task.id);
    expect(f.rows(CustomerChatTask)[0].status).toBe('completed');
    expect(f.rows(CustomerChatMessage)).toHaveLength(1);
    expect(f.service['pendingFinalizers'].size).toBe(0);
    expect(f.service['running'].size).toBe(0);
    expect(f.ai.askStream).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it('shutdown 等待正在领取的任务，禁止停机后启动模型再释放单实例锁', async () => {
    const f = fixture();
    f.session(1);
    const task = f.task(1, { status: 'running' });
    const query = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ externalAppId: 1 }]),
    };
    f.service['tasks'].createQueryBuilder = jest.fn().mockReturnValue(query);
    let releaseClaim!: (tasks: CustomerChatTask[]) => void;
    const takeTasks = jest
      .spyOn(
        f.service as unknown as {
          takeTasks(appId: number): Promise<CustomerChatTask[]>;
        },
        'takeTasks',
      )
      .mockImplementation(
        () =>
          new Promise<CustomerChatTask[]>((resolve) => {
            releaseClaim = resolve;
          }),
      );
    const lock = {
      query: jest.fn().mockResolvedValue([{ ownsLock: 1 }]),
      release: jest.fn().mockResolvedValue(undefined),
    };
    f.service['lockRunner'] = lock as unknown as QueryRunner;
    f.schedule.mockRestore();
    f.service['schedule']();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(takeTasks).toHaveBeenCalled();
    const shutdown = f.service.onModuleDestroy();
    expect(lock.release).not.toHaveBeenCalled();
    releaseClaim([task]);
    await shutdown;
    expect(f.ai.askStream).not.toHaveBeenCalled();
    expect(f.rows(CustomerChatTask)[0].status).toBe('cancelled');
    expect(lock.release).toHaveBeenCalledTimes(1);
    expect(f.service['running'].size).toBe(0);
  });

  it('处理超时明确通知访客，等待执行器取消完成后释放名额', async () => {
    jest.useFakeTimers();
    try {
      const f = fixture();
      f.session(1);
      const task = f.task(1, { status: 'running' });
      f.ai.askStream.mockImplementation(
        (
          _dto: unknown,
          _writer: unknown,
          _app: unknown,
          execution: { signal: AbortSignal },
        ) =>
          new Promise<void>((_resolve, reject) =>
            execution.signal.addEventListener(
              'abort',
              () => reject(execution.signal.reason),
              { once: true },
            ),
          ),
      );
      const state = {
        controller: new AbortController(),
        publishAllowed: true,
        answer: '',
      };
      f.service['running'].set(task.id, state);
      const execution = f.service['execute'](task, state);
      await jest.advanceTimersByTimeAsync(180_000);
      await execution;
      expect(state.controller.signal.aborted).toBe(true);
      expect(f.rows(CustomerChatTask)[0].status).toBe('cancelled');
      expect(
        f
          .rows(CustomerChatMessage)
          .some((row) => String(row.content).includes('处理超时')),
      ).toBe(true);
      expect(f.service['running'].size).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('SSE 只发送变化快照，断线清理订阅但不取消持久化任务', async () => {
    jest.useFakeTimers();
    try {
      const f = fixture();
      const write = jest.fn();
      const cleanup = f.service.subscribe(1, write);
      await jest.advanceTimersByTimeAsync(2500);
      expect(write).toHaveBeenCalledTimes(1);
      expect(write.mock.calls[0][0]).toBe('snapshot');
      f.snapshot.mockResolvedValue({
        sessionId: 1,
        serviceStatus: 'human',
      } as CustomerSessionSnapshot);
      await jest.advanceTimersByTimeAsync(1000);
      expect(write).toHaveBeenCalledTimes(2);
      cleanup();
      await jest.advanceTimersByTimeAsync(30_000);
      expect(write).toHaveBeenCalledTimes(2);
      expect(f.service['events'].listenerCount('session:1')).toBe(0);
      expect(f.schedule).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('只允许正确应用与正确随机凭证读取会话，错误凭证不会返回哈希', async () => {
    const f = fixture();
    const token = 'a'.repeat(64);
    const query = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest
        .fn()
        .mockResolvedValue({
          id: 1,
          externalAppId: 1,
          sessionTokenHash: createHash('sha256').update(token).digest('hex'),
        }),
    };
    f.sessionRepo.createQueryBuilder = jest.fn().mockReturnValue(query);
    await expect(
      f.service.assertVisitor(1, f.app, token),
    ).resolves.toMatchObject({ id: 1 });
    expect(query.andWhere).toHaveBeenCalledWith(
      'session.externalAppId = :appId',
      { appId: 1 },
    );
    await expect(
      f.service.assertVisitor(1, f.app, 'b'.repeat(64)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    query.getOne.mockResolvedValueOnce(null);
    await expect(
      f.service.assertVisitor(1, { ...f.app, id: 2 }, token),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      f.service.assertVisitor(1, f.app, undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('快照显式分页并能恢复当前 AI 部分输出，永不返回会话凭证', async () => {
    const f = fixture();
    f.snapshot.mockRestore();
    f.session(1);
    const task = f.task(1, { status: 'running', answer: '数据库片段' });
    f.service['running'].set(task.id, {
      controller: new AbortController(),
      publishAllowed: true,
      answer: '最新片段',
    });
    for (let index = 0; index < 205; index++)
      f.insert(CustomerChatMessage, {
        sessionId: 1,
        role: 'user',
        content: String(index),
        clientMessageId: `request_${index}`,
        taskId: null,
      });
    const latest = await f.service.getSnapshot(1);
    expect(latest.messages).toHaveLength(200);
    expect(latest.hasMoreMessages).toBe(true);
    expect(latest.nextBeforeMessageId).toBe(6);
    expect(latest.activeTask?.answer).toBe('最新片段');
    expect(latest).not.toHaveProperty('sessionTokenHash');
    const older = await f.service.getSnapshot(1, latest.nextBeforeMessageId!);
    expect(older.messages).toHaveLength(5);
    expect(older.hasMoreMessages).toBe(false);
  });
});
