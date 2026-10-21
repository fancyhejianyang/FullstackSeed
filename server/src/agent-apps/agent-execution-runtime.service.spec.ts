import type { DataSource, EntityManager, Repository } from 'typeorm';
import type { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import {
  AgentCancelledError,
  AgentExecutionRuntimeService,
  AgentTimeoutError,
} from './agent-execution-runtime.service';
import { AgentPendingAction } from './entities/agent-pending-action.entity';
import { AgentExecution } from './entities/agent-execution.entity';
import { AgentMessage } from './entities/agent-message.entity';

describe('AgentExecutionRuntimeService', () => {
  const executionRepository = { find: jest.fn() };
  let executionSignal: AbortSignal | undefined;
  const providers = {
    withExecutionSignal: jest.fn(
      (signal: AbortSignal, run: () => Promise<unknown>) => {
        executionSignal = signal;
        return run();
      },
    ),
  };
  const executionUpdates = { update: jest.fn() };
  const pendingActionUpdates = { update: jest.fn() };
  const messages = {
    findOne: jest.fn(),
    create: jest.fn((value: Partial<AgentMessage>) => value),
    save: jest.fn(),
  };
  const sessions = { increment: jest.fn(), update: jest.fn() };
  const manager = {
    getRepository: (entity: unknown) =>
      entity === AgentExecution
        ? executionUpdates
        : entity === AgentPendingAction
          ? pendingActionUpdates
          : entity === AgentMessage
            ? messages
            : sessions,
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn(
      (run: (entityManager: EntityManager) => Promise<unknown>) => run(manager),
    ),
  };
  const service = new AgentExecutionRuntimeService(
    executionRepository as unknown as Repository<AgentExecution>,
    dataSource as unknown as DataSource,
    providers as unknown as KnowledgeAiProvidersService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    executionSignal = undefined;
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('actively aborts the whole execution signal when the user stops', async () => {
    const running = service.run(7, 60, () => new Promise(() => undefined));
    await Promise.resolve();
    expect(service.cancel(7)).toBe(true);
    await expect(running).rejects.toBeInstanceOf(AgentCancelledError);
    expect(executionSignal?.aborted).toBe(true);
  });

  it('aborts and rejects a hanging execution at the configured timeout', async () => {
    jest.useFakeTimers();
    const running = service.run(8, 1, () => new Promise(() => undefined));
    const rejection = expect(running).rejects.toBeInstanceOf(AgentTimeoutError);
    await jest.advanceTimersByTimeAsync(1_000);
    await rejection;
    expect(executionSignal?.aborted).toBe(true);
  });

  it('recovers an expired execution, its submitting pendingAction and its session receipt', async () => {
    executionRepository.find.mockResolvedValue([
      Object.assign(new AgentExecution(), {
        id: 9,
        sessionId: 3,
        userId: 4,
        messageId: 5,
        pendingActionId: 6,
        status: 'running',
      }),
    ]);
    executionUpdates.update.mockResolvedValue({ affected: 1 });
    messages.findOne.mockResolvedValue(null);

    await expect(service.recoverExpiredExecutions()).resolves.toBe(1);

    expect(executionUpdates.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 9 }),
      expect.objectContaining({
        status: 'failed',
        statusReason: 'stale_lease',
        failureStage: 'recovery',
      }),
    );
    expect(pendingActionUpdates.update).toHaveBeenCalledWith(
      { id: 6, status: 'submitting' },
      { status: 'failed' },
    );
    expect(messages.save).toHaveBeenCalled();
    expect(sessions.update).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ lastExecutionStatus: 'failed' }),
    );
  });
});
