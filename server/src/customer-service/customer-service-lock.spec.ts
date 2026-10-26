import { DataSource, QueryRunner, Repository } from 'typeorm';
import { ExternalApp } from '../external-apps/entities/external-app.entity';
import { KnowledgeAiChatSession } from '../knowledge-ai-chat/entities/knowledge-ai-chat-session.entity';
import { KnowledgeAiChatService } from '../knowledge-ai-chat/knowledge-ai-chat.service';
import { CustomerChatMessage } from './entities/customer-chat-message.entity';
import { CustomerChatTask } from './entities/customer-chat-task.entity';
import { CustomerServiceService } from './customer-service.service';

const services = new Set<CustomerServiceService>();

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture() {
  // 仅内存 mock，不建立数据源连接，也不运行调度器或调用 AI。
  const runner = {
    connect: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    query: jest
      .fn<Promise<unknown>, [string, unknown[]?]>()
      .mockResolvedValue([{ acquired: 1 }]),
    release: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  };
  const source = { createQueryRunner: jest.fn().mockReturnValue(runner) };
  const service = new CustomerServiceService(
    source as unknown as DataSource,
    {} as Repository<KnowledgeAiChatSession>,
    {} as Repository<CustomerChatTask>,
    {} as Repository<CustomerChatMessage>,
    {} as Repository<ExternalApp>,
    {} as KnowledgeAiChatService,
  );
  const recover = jest
    .spyOn(
      service as unknown as { recoverInterruptedTasks(): Promise<void> },
      'recoverInterruptedTasks',
    )
    .mockResolvedValue(undefined);
  const schedule = jest
    .spyOn(service as unknown as { schedule(): void }, 'schedule')
    .mockImplementation(() => undefined);
  services.add(service);
  return { service, runner, source, recover, schedule };
}

function expectNoLockRelease(runner: ReturnType<typeof fixture>['runner']) {
  expect(
    runner.query.mock.calls.some(([sql]) => sql.includes('RELEASE_LOCK')),
  ).toBe(false);
}

describe('CustomerServiceService 单实例调度锁生命周期（离线 mock）', () => {
  afterEach(async () => {
    await Promise.all(
      [...services].map((service) => service.onModuleDestroy()),
    );
    services.clear();
    jest.restoreAllMocks();
  });

  it.each([1, '1'])(
    '取得锁 %p 后才恢复孤儿任务并启动调度',
    async (acquired) => {
      const f = fixture();
      const recovery = deferred();
      f.runner.query.mockResolvedValueOnce([{ acquired }]);
      f.recover.mockReturnValueOnce(recovery.promise);

      const initializing = f.service.onModuleInit();
      expect(f.service.onModuleInit()).toBe(initializing);
      await Promise.resolve();
      await Promise.resolve();

      expect(f.runner.query).toHaveBeenCalledWith(
        "SELECT GET_LOCK(SHA2(CONCAT(DATABASE(), ':customer-service-dispatch'), 256), ?) AS acquired",
        [10],
      );
      expect(f.recover).toHaveBeenCalledTimes(1);
      expect(f.source.createQueryRunner).toHaveBeenCalledTimes(1);
      expect(f.service['lockRunner']).toBe(f.runner);
      expect(f.service['ready']).toBe(false);
      expect(f.service['timer']).toBeUndefined();
      expect(f.schedule).not.toHaveBeenCalled();

      recovery.resolve();
      await initializing;
      expect(f.service['ready']).toBe(true);
      expect(f.service['timer']).toBeDefined();
      expect(f.schedule).toHaveBeenCalledTimes(1);
    },
  );

  it.each([0, '0'])(
    '取锁返回 %p 为超时，仅诊断持锁连接且绝不解锁',
    async (acquired) => {
      const f = fixture();
      f.runner.query
        .mockResolvedValueOnce([{ acquired }])
        .mockResolvedValueOnce([{ holderConnectionId: 42 }]);

      await expect(f.service.onModuleInit()).rejects.toThrow(
        '客服调度锁等待超时（10 秒），当前持锁连接编号：42',
      );
      expect(f.runner.query).toHaveBeenCalledTimes(2);
      expect(f.runner.query.mock.calls[1][0]).toContain('IS_USED_LOCK');
      expectNoLockRelease(f.runner);
      expect(f.runner.release).toHaveBeenCalledTimes(1);
      expect(f.recover).not.toHaveBeenCalled();
      expect(f.schedule).not.toHaveBeenCalled();
      expect(f.service['ready']).toBe(false);
      expect(f.service['lockRunner']).toBeUndefined();
      await f.service.onModuleDestroy();
      expectNoLockRelease(f.runner);
      expect(f.runner.release).toHaveBeenCalledTimes(1);
    },
  );

  it('仅展示规范的正整数持锁连接编号', async () => {
    const f = fixture();
    f.runner.query
      .mockResolvedValueOnce([{ acquired: 0 }])
      .mockResolvedValueOnce([{ holderConnectionId: '123' }]);

    await expect(f.service.onModuleInit()).rejects.toThrow(
      '当前持锁连接编号：123',
    );
    expectNoLockRelease(f.runner);
  });

  it.each([
    null,
    undefined,
    0,
    -1,
    1.5,
    true,
    '',
    '001',
    '12 extra',
    Number.MAX_SAFE_INTEGER + 1,
    '9007199254740992',
  ])('超时后的持锁诊断值 %p 不得伪造连接编号', async (holderConnectionId) => {
    const f = fixture();
    f.runner.query
      .mockResolvedValueOnce([{ acquired: 0 }])
      .mockResolvedValueOnce([{ holderConnectionId }]);

    await expect(f.service.onModuleInit()).rejects.toThrow(
      '客服调度锁等待超时（10 秒），持锁连接暂不可确认',
    );
    expect(f.runner.query).toHaveBeenCalledTimes(2);
    expectNoLockRelease(f.runner);
  });

  it('诊断查询失败保留超时语义，不重试取锁或释放他人的锁', async () => {
    const f = fixture();
    f.runner.query
      .mockResolvedValueOnce([{ acquired: 0 }])
      .mockRejectedValueOnce(new Error('诊断查询失败'));

    await expect(f.service.onModuleInit()).rejects.toThrow(
      '客服调度锁等待超时（10 秒），持锁连接暂不可确认',
    );
    expect(f.runner.query).toHaveBeenCalledTimes(2);
    expectNoLockRelease(f.runner);
    expect(f.runner.release).toHaveBeenCalledTimes(1);
  });

  it.each([null, undefined, true, false, 2, -1, '', 'invalid', '01'])(
    'GET_LOCK 返回 %p 是取锁异常，不冒充另一实例持锁',
    async (acquired) => {
      const f = fixture();
      f.runner.query.mockResolvedValueOnce([{ acquired }]);

      await expect(f.service.onModuleInit()).rejects.toThrow(
        '客服调度取锁异常',
      );
      expect(f.runner.query).toHaveBeenCalledTimes(1);
      expectNoLockRelease(f.runner);
      expect(f.recover).not.toHaveBeenCalled();
      expect(f.schedule).not.toHaveBeenCalled();
      expect(f.runner.release).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { rows: null },
    { rows: [] },
    { rows: [{}] },
    { rows: {} },
    { rows: 'invalid result' },
  ])('GET_LOCK 结果形状 %p 无效时不执行诊断或恢复', async ({ rows }) => {
    const f = fixture();
    f.runner.query.mockResolvedValueOnce(rows);

    await expect(f.service.onModuleInit()).rejects.toThrow('客服调度取锁异常');
    expect(f.runner.query).toHaveBeenCalledTimes(1);
    expectNoLockRelease(f.runner);
    expect(f.recover).not.toHaveBeenCalled();
    expect(f.schedule).not.toHaveBeenCalled();
  });

  it('取锁查询失败报告取锁异常并只释放连接', async () => {
    const f = fixture();
    const cause = new Error('取锁查询失败');
    f.runner.query.mockRejectedValueOnce(cause);

    await expect(f.service.onModuleInit()).rejects.toMatchObject({
      message: '客服调度取锁异常，请检查数据库连接与命名锁状态',
      cause,
    });
    expectNoLockRelease(f.runner);
    expect(f.runner.query).toHaveBeenCalledTimes(1);
    expect(f.runner.release).toHaveBeenCalledTimes(1);
    expect(f.recover).not.toHaveBeenCalled();
  });

  it('连接失败仍尝试释放 runner，释放失败不覆盖原取锁异常', async () => {
    const f = fixture();
    const cause = new Error('连接失败');
    f.runner.connect.mockRejectedValueOnce(cause);
    f.runner.release.mockRejectedValueOnce(new Error('连接释放失败'));

    await expect(f.service.onModuleInit()).rejects.toMatchObject({
      message: '客服调度取锁异常，请检查数据库连接与命名锁状态',
      cause,
    });
    expect(f.runner.query).not.toHaveBeenCalled();
    expect(f.runner.release).toHaveBeenCalledTimes(1);
    expect(f.recover).not.toHaveBeenCalled();
    expect(f.schedule).not.toHaveBeenCalled();
    expect(f.service['lockRunner']).toBeUndefined();
  });

  it('恢复失败只释放本次取得的锁并清除引用，重复销毁不会再解锁', async () => {
    const f = fixture();
    const cause = new Error('孤儿任务恢复失败');
    f.recover.mockRejectedValueOnce(cause);

    await expect(f.service.onModuleInit()).rejects.toBe(cause);
    expect(f.runner.query).toHaveBeenCalledTimes(2);
    expect(f.runner.query.mock.calls[1][0]).toContain('RELEASE_LOCK');
    expect(f.runner.release).toHaveBeenCalledTimes(1);
    expect(f.service['lockRunner']).toBeUndefined();
    expect(f.service['ready']).toBe(false);
    expect(f.schedule).not.toHaveBeenCalled();

    await f.service.onModuleDestroy();
    await f.service.onModuleDestroy();
    expect(f.runner.query).toHaveBeenCalledTimes(2);
    expect(f.runner.release).toHaveBeenCalledTimes(1);
  });

  it('恢复失败后的解锁异常仍释放连接且不覆盖恢复失败原因', async () => {
    const f = fixture();
    const cause = new Error('孤儿任务恢复失败');
    f.recover.mockRejectedValueOnce(cause);
    f.runner.query
      .mockResolvedValueOnce([{ acquired: 1 }])
      .mockRejectedValueOnce(new Error('解锁失败'));

    await expect(f.service.onModuleInit()).rejects.toBe(cause);
    expect(f.runner.release).toHaveBeenCalledTimes(1);
    expect(f.service['lockRunner']).toBeUndefined();
  });

  it('取锁等待期间关闭，等待取锁结束后仅清理新取得的锁而不恢复或调度', async () => {
    const f = fixture();
    const acquisition = deferred();
    f.runner.query.mockImplementationOnce(async () => {
      await acquisition.promise;
      return [{ acquired: 1 }];
    });
    const initializing = f.service.onModuleInit();
    const cancelled =
      expect(initializing).rejects.toThrow(
        '客服调度初始化已取消，服务正在关闭',
      );
    await Promise.resolve();
    expect(f.runner.query).toHaveBeenCalledTimes(1);

    const shutdown = f.service.onModuleDestroy();
    expect(f.service['stopping']).toBe(true);
    expect(f.service['ready']).toBe(false);
    expect(f.runner.release).not.toHaveBeenCalled();
    acquisition.resolve();
    await cancelled;
    await shutdown;

    expect(f.recover).not.toHaveBeenCalled();
    expect(f.schedule).not.toHaveBeenCalled();
    expect(f.service['timer']).toBeUndefined();
    expect(f.service['ready']).toBe(false);
    expect(f.service['lockRunner']).toBeUndefined();
    expect(f.runner.query).toHaveBeenCalledTimes(2);
    expect(f.runner.query.mock.calls[1][0]).toContain('RELEASE_LOCK');
    expect(f.runner.release).toHaveBeenCalledTimes(1);
  });

  it('恢复等待期间关闭，恢复真正结束前不释放锁且不能重新启动调度', async () => {
    const f = fixture();
    const recovery = deferred();
    f.recover.mockReturnValueOnce(recovery.promise);
    const initializing = f.service.onModuleInit();
    const cancelled =
      expect(initializing).rejects.toThrow(
        '客服调度初始化已取消，服务正在关闭',
      );
    await Promise.resolve();
    await Promise.resolve();
    expect(f.recover).toHaveBeenCalledTimes(1);

    const shutdown = f.service.onModuleDestroy();
    expect(f.service['stopping']).toBe(true);
    expect(f.service['ready']).toBe(false);
    expect(f.runner.query).toHaveBeenCalledTimes(1);
    expect(f.runner.release).not.toHaveBeenCalled();
    recovery.resolve();
    await cancelled;
    await shutdown;

    expect(f.schedule).not.toHaveBeenCalled();
    expect(f.service['timer']).toBeUndefined();
    expect(f.service['ready']).toBe(false);
    expect(f.service['lockRunner']).toBeUndefined();
    expect(f.runner.query).toHaveBeenCalledTimes(2);
    expect(f.runner.query.mock.calls[1][0]).toContain('RELEASE_LOCK');
    expect(f.runner.release).toHaveBeenCalledTimes(1);
  });

  it('关闭先于初始化时不创建 runner、不取锁或启动恢复与调度', async () => {
    const f = fixture();
    const shutdown = f.service.onModuleDestroy();

    await expect(f.service.onModuleInit()).rejects.toThrow(
      '客服调度初始化已取消，服务正在关闭',
    );
    await shutdown;
    expect(f.source.createQueryRunner).not.toHaveBeenCalled();
    expect(f.runner.connect).not.toHaveBeenCalled();
    expect(f.runner.query).not.toHaveBeenCalled();
    expect(f.runner.release).not.toHaveBeenCalled();
    expect(f.recover).not.toHaveBeenCalled();
    expect(f.schedule).not.toHaveBeenCalled();
    expect(f.service['timer']).toBeUndefined();
    expect(f.service['ready']).toBe(false);
  });

  it('销毁先等领取事务，再取消发布与 SSE，执行真正结束后才解锁', async () => {
    const f = fixture();
    const claim = deferred();
    const execution = deferred();
    const state = {
      controller: new AbortController(),
      publishAllowed: true,
      answer: '',
    };
    f.service['ready'] = true;
    f.service['lockRunner'] = f.runner as unknown as QueryRunner;
    f.service['drainPromise'] = claim.promise;
    f.service['running'].set(1, state);
    f.service['executions'].add(execution.promise);
    const notified = deferred();
    const shutdownListener = jest.fn(() => notified.resolve());
    f.service['events'].on('shutdown', shutdownListener);

    const shutdown = f.service.onModuleDestroy();
    expect(f.service['stopping']).toBe(true);
    expect(f.service['ready']).toBe(false);
    expect(state.publishAllowed).toBe(true);
    expect(state.controller.signal.aborted).toBe(false);
    expect(shutdownListener).not.toHaveBeenCalled();
    expect(f.runner.query).not.toHaveBeenCalled();
    expect(f.runner.release).not.toHaveBeenCalled();

    claim.resolve();
    await notified.promise;
    expect(state.publishAllowed).toBe(false);
    expect(state.controller.signal.aborted).toBe(true);
    expect(shutdownListener).toHaveBeenCalledTimes(1);
    expect(f.service['events'].eventNames()).toHaveLength(0);
    expect(f.runner.query).not.toHaveBeenCalled();
    expect(f.runner.release).not.toHaveBeenCalled();

    execution.resolve();
    await shutdown;
    expect(f.runner.query).toHaveBeenCalledTimes(1);
    expect(f.runner.query.mock.calls[0][0]).toContain('RELEASE_LOCK');
    expect(f.runner.release).toHaveBeenCalledTimes(1);
    expect(f.service['lockRunner']).toBeUndefined();
  });

  it('并发或重复销毁复用同一清理过程，解锁和连接释放仅一次', async () => {
    const f = fixture();
    const execution = deferred();
    f.service['lockRunner'] = f.runner as unknown as QueryRunner;
    f.service['executions'].add(execution.promise);
    const shutdownListener = jest.fn();
    f.service['events'].on('shutdown', shutdownListener);

    const first = f.service.onModuleDestroy();
    const second = f.service.onModuleDestroy();
    expect(second).toBe(first);
    expect(f.runner.release).not.toHaveBeenCalled();
    execution.resolve();
    await Promise.all([first, second]);
    await f.service.onModuleDestroy();

    expect(shutdownListener).toHaveBeenCalledTimes(1);
    expect(f.runner.query).toHaveBeenCalledTimes(1);
    expect(f.runner.release).toHaveBeenCalledTimes(1);
  });

  it('销毁时解锁查询失败仍释放连接并清空锁引用', async () => {
    const f = fixture();
    f.service['lockRunner'] = f.runner as unknown as QueryRunner;
    f.runner.query.mockRejectedValueOnce(new Error('解锁失败'));

    await expect(f.service.onModuleDestroy()).resolves.toBeUndefined();
    expect(f.runner.release).toHaveBeenCalledTimes(1);
    expect(f.service['lockRunner']).toBeUndefined();
    await f.service.onModuleDestroy();
    expect(f.runner.query).toHaveBeenCalledTimes(1);
    expect(f.runner.release).toHaveBeenCalledTimes(1);
  });
});
