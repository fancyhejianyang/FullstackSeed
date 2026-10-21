import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  Like,
  type DataSource,
  type FindManyOptions,
  type Repository,
} from 'typeorm';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { AgentAppsController } from './agent-apps.controller';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { KnowledgeAiChatService } from '../knowledge-ai-chat/knowledge-ai-chat.service';
import type { ProductCatalogService } from '../product-catalog/product-catalog.service';
import type { AgentAppsService } from './agent-apps.service';
import { AgentWorkspaceService } from './agent-workspace.service';
import { AgentModelRouterService } from './agent-model-router.service';
import type { AgentMediaService } from './agent-media.service';
import { AgentPendingAction } from './entities/agent-pending-action.entity';
import { AgentExecution } from './entities/agent-execution.entity';
import { AgentMessage } from './entities/agent-message.entity';
import { AgentSession } from './entities/agent-session.entity';
import { AgentApp } from './entities/agent-app.entity';
import { classifyAgentAction } from './agent-action';
import type { AgentBusinessService } from './agent-business.service';
import type { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import type { AgentExecutionRuntimeService } from './agent-execution-runtime.service';
import {
  knowledgeStageToAgentProgress,
  type AgentProgressStage,
} from './agent-progress';

const currentUser: AuthUser = {
  userId: 10,
  username: 'employee-10',
  isAdmin: false,
  roles: [],
  permissions: ['AgentWorkspace.read', 'Product.read', 'ProductSku.create'],
};

describe('AgentWorkspaceService ownership and state guards', () => {
  const sessionRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
    increment: jest.fn(),
  };
  const messageRepository = {
    find: jest.fn(),
    count: jest.fn(),
    create: jest.fn((value: Partial<AgentMessage>) => value),
    save: jest.fn((value: AgentMessage) =>
      Promise.resolve({ ...value, id: 88 }),
    ),
  };
  const pendingActionRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const executionRepository = {
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    count: jest.fn(),
    save: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const knowledgeAiChatService = {
    askForAgent: jest.fn(),
  };
  const appsService = { getExecutableToolKeys: jest.fn() };
  const productCatalogService = { createSkuFromAgent: jest.fn() };
  const service = new AgentWorkspaceService(
    sessionRepository as unknown as Repository<AgentSession>,
    messageRepository as unknown as Repository<AgentMessage>,
    pendingActionRepository as unknown as Repository<AgentPendingAction>,
    executionRepository as unknown as Repository<AgentExecution>,
    {} as DataSource,
    appsService as unknown as AgentAppsService,
    knowledgeAiChatService as unknown as KnowledgeAiChatService,
    productCatalogService as unknown as ProductCatalogService,
    {} as AgentBusinessService,
    {} as KnowledgeAiProvidersService,
    new AgentModelRouterService({
      withExecutionSignal: (
        _signal: AbortSignal,
        run: () => Promise<unknown>,
      ) => run(),
    } as KnowledgeAiProvidersService),
    {} as AgentMediaService,
    {
      run: (_id: number, _seconds: number, task: () => Promise<unknown>) =>
        task(),
      cancel: jest.fn(),
    } as unknown as AgentExecutionRuntimeService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    executionRepository.update.mockResolvedValue({ affected: 1 });
    executionRepository.count.mockResolvedValue(0);
    appsService.getExecutableToolKeys.mockResolvedValue([
      'product.query',
      'productSku.create',
    ]);
  });

  it('selects only scalar list fields while preserving filters, pagination and elapsed time', async () => {
    const row = {
      id: 9,
      requestId: 'message:1:abc',
      sessionId: 1,
      userId: 10,
      agentAppId: 3,
      toolKey: 'productSku.create',
      status: 'succeeded',
      statusReason: 'completed',
      totalTokens: 0,
      modelCallDurationMs: 0,
      startedAt: new Date('2026-10-19T00:00:00Z'),
      finishedAt: new Date('2026-10-19T00:00:01Z'),
      createdAt: new Date('2026-10-19T00:00:00Z'),
      parameterSummary: { large: 'x'.repeat(10000) },
      result: { recordType: 'productSku', recordId: 7 },
      configSnapshot: { models: ['model'] },
      errorMessage: 'large error body',
    };
    executionRepository.findAndCount.mockResolvedValue([[row], 21]);
    const result = await service.findExecutionRecords({
      page: 2,
      pageSize: 10,
      agentAppId: 3,
      userId: 10,
      status: 'succeeded',
      keyword: ' abc ',
    });
    const [options] = executionRepository.findAndCount.mock.calls[0] as [
      FindManyOptions<AgentExecution>,
    ];
    const fields = [
      'id',
      'requestId',
      'sessionId',
      'userId',
      'agentAppId',
      'toolKey',
      'status',
      'statusReason',
      'totalTokens',
      'modelCallDurationMs',
      'startedAt',
      'finishedAt',
      'createdAt',
    ];
    expect(options).toEqual({
      select: fields,
      where: [
        {
          agentAppId: 3,
          userId: 10,
          status: 'succeeded',
          requestId: Like('%abc%'),
        },
        {
          agentAppId: 3,
          userId: 10,
          status: 'succeeded',
          errorMessage: Like('%abc%'),
        },
      ],
      order: { id: 'DESC' },
      skip: 10,
      take: 10,
    });
    expect(result.total).toBe(21);
    expect(Object.keys(result.list[0])).toEqual([
      ...fields,
      'elapsedMilliseconds',
    ]);
    expect(result.list[0]).toMatchObject({
      elapsedMilliseconds: 1000,
      totalTokens: 0,
      modelCallDurationMs: 0,
    });
    expect(result.list[0]).not.toHaveProperty('result');
    expect(result.list[0]).not.toHaveProperty('parameterSummary');
    expect(result.list[0]).not.toHaveProperty('configSnapshot');
    expect(result.list[0]).not.toHaveProperty('errorMessage');
  });

  it('keeps unfinished duration null and handles empty execution lists', async () => {
    executionRepository.findAndCount.mockResolvedValue([
      [{ id: 1, startedAt: new Date(), finishedAt: null }],
      1,
    ]);
    expect(
      (await service.findExecutionRecords({})).list[0].elapsedMilliseconds,
    ).toBeNull();
    expect(executionRepository.findAndCount).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: {}, skip: 0, take: 20 }),
    );
    executionRepository.findAndCount.mockResolvedValue([[], 0]);
    await expect(service.findExecutionRecords({})).resolves.toEqual({
      list: [],
      total: 0,
    });
  });

  it('loads the full management record only on detail requests and preserves owner-only workspace lookup', async () => {
    const row = {
      id: 9,
      parameterSummary: { modelRouting: { attempts: [] } },
      result: { recordId: 7 },
      configSnapshot: { configVersion: 'v1' },
      errorMessage: 'failure',
      startedAt: new Date(0),
      finishedAt: new Date(120),
    };
    executionRepository.findOne.mockResolvedValue(row);
    await expect(service.findExecutionRecord(9)).resolves.toEqual({
      ...row,
      elapsedMilliseconds: 120,
    });
    expect(executionRepository.findOne).toHaveBeenLastCalledWith({
      where: { id: 9 },
    });
    executionRepository.findOne.mockResolvedValue(null);
    await expect(service.findExecutionRecord(404)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.findExecution(9, currentUser)).rejects.toThrow(
      NotFoundException,
    );
    expect(executionRepository.findOne).toHaveBeenLastCalledWith({
      where: { id: 9, userId: currentUser.userId },
    });
    expect(executionRepository.save).not.toHaveBeenCalled();
    expect(executionRepository.update).not.toHaveBeenCalled();
  });

  it('requires AgentApp.read for both management list and detail, not workspace access', () => {
    const guard = new PermissionsGuard(new Reflector());
    for (const method of [
      'findExecutionRecords',
      'findExecutionRecord',
    ] as const) {
      const context = (permissions: string[], isAdmin = false) =>
        ({
          getHandler: () => AgentAppsController.prototype[method],
          getClass: () => AgentAppsController,
          switchToHttp: () => ({
            getRequest: () => ({ user: { permissions, isAdmin } }),
          }),
        }) as ExecutionContext;
      expect(() => guard.canActivate(context(['AgentWorkspace.read']))).toThrow(
        ForbiddenException,
      );
      expect(() => guard.canActivate(context([]))).toThrow(ForbiddenException);
      expect(guard.canActivate(context(['AgentApp.read']))).toBe(true);
      expect(guard.canActivate(context([], true))).toBe(true);
    }
  });

  it('returns null for missing or foreign progress without exposing execution data', async () => {
    executionRepository.findOne.mockResolvedValue(null);
    await expect(
      service.findExecutionProgress('message:1:abc', currentUser),
    ).resolves.toBeNull();
    expect(executionRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { requestId: 'message:1:abc', userId: currentUser.userId },
      }),
    );
    expect(executionRepository.save).not.toHaveBeenCalled();
    expect(executionRepository.update).not.toHaveBeenCalled();
  });

  it('projects only safe stage fields and hides stale stages on completed executions', async () => {
    const execution = {
      id: 7,
      requestId: 'message:1:abc',
      sessionId: 1,
      status: 'running',
      startedAt: new Date(),
      parameterSummary: { progressStage: 'querying', fields: ['secret'] },
      result: { privateData: true },
      errorMessage: 'internal error',
    };
    executionRepository.findOne.mockResolvedValue(execution);
    expect(
      await service.findExecutionProgress(execution.requestId, currentUser),
    ).toEqual({
      executionId: 7,
      requestId: execution.requestId,
      sessionId: 1,
      status: 'running',
      startedAt: execution.startedAt,
      stage: 'querying',
    });
    for (const status of [
      'cancelled',
      'failed',
      'succeeded',
      'waiting_input',
      'waiting_confirmation',
    ]) {
      execution.status = status;
      expect(
        (await service.findExecutionProgress(execution.requestId, currentUser))
          ?.stage,
      ).toBeNull();
    }
    execution.status = 'running';
    execution.parameterSummary.progressStage = 'unrecognized';
    expect(
      (await service.findExecutionProgress(execution.requestId, currentUser))
        ?.stage,
    ).toBeNull();
    expect(executionRepository.save).not.toHaveBeenCalled();
  });

  it('updates stages conditionally without overwriting status and rejects a stopped execution', async () => {
    const reportProgress = Reflect.get(service, 'reportProgress') as (
      execution: AgentExecution,
      stage: AgentProgressStage,
    ) => Promise<void>;
    const execution = Object.assign(new AgentExecution(), {
      id: 7,
      userId: 10,
      status: 'running',
      parameterSummary: { action: 'query' },
    });
    await reportProgress.call(service, execution, 'querying');
    expect(executionRepository.update).toHaveBeenCalledWith(
      { id: 7, userId: 10, status: 'running' },
      expect.objectContaining({
        parameterSummary: { action: 'query', progressStage: 'querying' },
      }),
    );
    expect(execution.heartbeatAt).toBeInstanceOf(Date);
    await reportProgress.call(service, execution, 'querying');
    expect(executionRepository.update).toHaveBeenCalledTimes(1);
    executionRepository.update.mockResolvedValueOnce({ affected: 0 });
    await expect(
      reportProgress.call(service, execution, 'generating'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(execution.parameterSummary?.progressStage).toBe('querying');
    expect(executionRepository.save).not.toHaveBeenCalled();
  });

  it('never revives an execution that was stopped during final persistence', async () => {
    const complete = Reflect.get(service, 'completeRunningExecution') as (
      execution: AgentExecution,
    ) => Promise<void>;
    executionRepository.update.mockResolvedValueOnce({ affected: 0 });
    await expect(
      complete.call(
        service,
        Object.assign(new AgentExecution(), {
          id: 7,
          userId: currentUser.userId,
          status: 'succeeded',
          toolKey: 'model.chat',
          parameterSummary: {},
          result: {},
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(executionRepository.save).not.toHaveBeenCalled();
  });

  it('maps only real knowledge stages to public operation labels', () => {
    expect(knowledgeStageToAgentProgress('产品关键词提炼')).toBe(
      'understanding',
    );
    expect(knowledgeStageToAgentProgress('业务数据查询')).toBe('querying');
    expect(knowledgeStageToAgentProgress('文本与向量召回')).toBe('retrieving');
    expect(knowledgeStageToAgentProgress('模型生成回答')).toBe('generating');
    expect(knowledgeStageToAgentProgress('回答依据摘要')).toBe('summarizing');
  });

  it('queries sessions with the authenticated user id and hides foreign sessions', async () => {
    sessionRepository.findOne.mockResolvedValue(null);
    await expect(service.findSession(99, currentUser)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(sessionRepository.findOne).toHaveBeenCalledWith({
      where: { id: 99, userId: currentUser.userId },
    });
  });

  it('returns older messages in display order with a stable total', async () => {
    messageRepository.find.mockResolvedValue([{ id: 8 }, { id: 7 }]);
    messageRepository.count.mockResolvedValue(12);
    await expect(
      service.findSessionMessages(
        3,
        { beforeId: 9, pageSize: 2 },
        currentUser,
        true,
      ),
    ).resolves.toEqual({ list: [{ id: 7 }, { id: 8 }], total: 12 });
    expect(messageRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { id: 'DESC' },
        take: 2,
      }),
    );
  });

  it('invalidates confirmation when the pendingAction version has changed', async () => {
    pendingActionRepository.findOne.mockResolvedValue({
      id: 5,
      userId: currentUser.userId,
      status: 'pending_confirmation',
      version: 3,
    });
    await expect(
      service.updatePendingAction(5, { version: 2, data: {} }, currentUser),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not turn an already successful execution into cancelled', async () => {
    const execution = {
      id: 7,
      userId: currentUser.userId,
      status: 'succeeded',
    } as AgentExecution;
    executionRepository.findOne.mockResolvedValue(execution);
    await expect(service.stopExecution(7, currentUser)).resolves.toBe(
      execution,
    );
    expect(executionRepository.save).not.toHaveBeenCalled();
  });

  it('counts only live leased executions before reserving concurrency', async () => {
    executionRepository.count.mockResolvedValue(1);
    const assertCapacity = Reflect.get(
      service,
      'assertConcurrencyAvailable',
    ) as (app: AgentApp, userId: number) => Promise<void>;
    await expect(
      assertCapacity.call(
        service,
        { id: 2, maxConcurrentRuns: 1 } as AgentApp,
        currentUser.userId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(executionRepository.count).toHaveBeenCalledTimes(1);
  });

  it('snapshots executable configuration by version without exposing raw instructions', () => {
    const metadata = Reflect.get(service, 'executionMetadata') as (
      app: AgentApp,
      startedAt: Date,
    ) => {
      configSnapshot: Record<string, unknown>;
      configVersion: string;
      leaseExpiresAt: Date;
    };
    const startedAt = new Date('2026-10-18T00:00:00.000Z');
    const result = metadata.call(
      service,
      {
        id: 2,
        name: '测试 Agent',
        responsibility: '处理测试任务',
        instructionMarkdown: '内部工作要求',
        providerId: 3,
        providerName: '测试账号',
        models: ['model-a'],
        modelRouting: null,
        mediaModels: null,
        toolKeys: [],
        writeEnabled: false,
        maxToolCalls: 5,
        timeoutSeconds: 60,
        maxConcurrentRuns: 1,
      } as AgentApp,
      startedAt,
    );
    expect(result.configVersion).toHaveLength(64);
    expect(result.configSnapshot.instructionMarkdown).toBeUndefined();
    expect(result.configSnapshot.instructionVersion).toMatch(/^[a-f0-9]{64}$/);
    expect(result.leaseExpiresAt.getTime()).toBe(startedAt.getTime() + 90_000);
  });

  it('treats normal answers as baseline model capability instead of a tool', () => {
    const resolveBusinessToolKey = Reflect.get(
      service,
      'resolveBusinessToolKey',
    ) as (action: string) => string | null;
    const resolveExecutionToolKey = Reflect.get(
      service,
      'resolveExecutionToolKey',
    ) as (action: string) => string;

    expect(resolveBusinessToolKey.call(service, 'answer')).toBeNull();
    expect(resolveBusinessToolKey.call(service, 'clarify')).toBeNull();
    expect(resolveBusinessToolKey.call(service, 'query')).toBe('product.query');
    expect(resolveExecutionToolKey.call(service, 'answer')).toBe('model.chat');

    const buildAgentSystemPrompt = Reflect.get(
      service,
      'buildAgentSystemPrompt',
    ) as (
      app: Partial<AgentApp>,
      user: AuthUser,
      executableToolKeys: string[],
    ) => string;
    const systemPrompt = buildAgentSystemPrompt.call(
      service,
      {
        responsibility: '产品助手',
        instructionMarkdown: '# 工作目标\n\n回答产品问题。',
        toolKeys: ['product.query', 'productSku.create'],
        writeEnabled: true,
      },
      currentUser,
      ['product.query', 'productSku.create'],
    );
    expect(systemPrompt).toContain('没有收到真实工具回执');
    expect(systemPrompt).toContain('# 工作目标');
    expect(systemPrompt).toContain('可生成 SKU 待确认操作');
    expect(systemPrompt).toContain('当前会话没有待确认的真实待确认操作');
  });

  it('falls back through selected models in order until one succeeds', async () => {
    const session = {
      id: 9,
      title: '测试会话',
      knowledgeSessionId: null,
      messageCount: 0,
      lastMessage: null,
    } as AgentSession;
    const execution = {
      id: 7,
      status: 'running',
      toolCallCount: 0,
    } as AgentExecution;
    executionRepository.findOne.mockResolvedValue(execution);
    knowledgeAiChatService.askForAgent
      .mockResolvedValueOnce({
        session: { id: 101 },
        message: {
          id: 201,
          isSuccess: false,
          answer: '',
          errorMessage: '主模型不可用',
          hitKnowledgeBaseNames: [],
          retrievalHits: [],
          businessContext: null,
        },
      })
      .mockResolvedValueOnce({
        session: { id: 101 },
        message: {
          id: 202,
          isSuccess: true,
          answer: '备用模型回答',
          errorMessage: null,
          hitKnowledgeBaseNames: ['产品库'],
          retrievalHits: [],
          businessContext: null,
        },
      });
    const processKnowledgeAnswer = Reflect.get(
      service,
      'processKnowledgeAnswer',
    ) as (params: {
      content: string;
      session: AgentSession;
      app: {
        providerId: number;
        models: string[];
        maxToolCalls: number;
        timeoutSeconds: number;
        responsibility: string;
        instructionMarkdown: string;
        toolKeys: string[];
      };
      execution: AgentExecution;
      user: AuthUser;
    }) => Promise<unknown>;

    await processKnowledgeAnswer.call(service, {
      content: '介绍产品',
      session,
      app: {
        providerId: 3,
        models: ['primary-model', 'fallback-model'],
        maxToolCalls: 5,
        timeoutSeconds: 60,
        responsibility: '产品助手',
        instructionMarkdown: '# 工作目标\n\n回答产品问题。',
        toolKeys: [],
      },
      execution,
      user: currentUser,
    });

    expect(knowledgeAiChatService.askForAgent).toHaveBeenCalledTimes(2);
    expect(knowledgeAiChatService.askForAgent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        providerId: 3,
        model: 'primary-model',
        workflowId: undefined,
      }),
      expect.any(Object),
      expect.any(Function),
    );
    expect(knowledgeAiChatService.askForAgent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ providerId: 3, model: 'fallback-model' }),
      expect.any(Object),
      expect.any(Function),
    );
    expect(execution.status).toBe('succeeded');
    expect(execution.toolCallCount).toBe(0);
    expect(execution.parameterSummary?.modelRouting).toMatchObject({
      attempts: [
        { model: 'primary-model', status: 'failed' },
        {
          model: 'fallback-model',
          status: 'succeeded',
        },
      ],
    });
  });

  const app = {
    id: 1,
    toolKeys: ['product.query', 'productSku.create'],
    writeEnabled: true,
  } as AgentApp;
  const makePendingAction = (): AgentPendingAction =>
    Object.assign(new AgentPendingAction(), {
      id: 5,
      sessionId: 9,
      userId: currentUser.userId,
      agentAppId: 1,
      toolKey: 'productSku.create',
      status: 'pending_confirmation',
      version: 3,
      data: {
        productId: 2,
        productName: '靠枕',
        skuCode: '',
        name: '',
        specifications: { 颜色: '蓝色' },
        isEnabled: true,
      },
      missingFields: [],
      validationErrors: [],
    });
  type ReviewParams = {
    decision: ReturnType<typeof classifyAgentAction>;
    session: AgentSession;
    app: AgentApp;
    execution: AgentExecution;
    activePendingAction: AgentPendingAction | null;
    user: AuthUser;
  };
  const review = Reflect.get(service, 'processWriteReview') as (
    params: ReviewParams,
  ) => Promise<{
    assistantMessage: AgentMessage;
    execution: AgentExecution;
    pendingAction: AgentPendingAction | null;
  }>;
  function reviewParams(
    pendingAction: AgentPendingAction | null,
  ): ReviewParams {
    return {
      decision: classifyAgentAction('符合，可以入库', Boolean(pendingAction)),
      session: { id: 9, messageCount: 1 } as AgentSession,
      app,
      execution: {
        id: 7,
        toolKey: 'model.chat',
        status: 'running',
        toolCallCount: 0,
      } as AgentExecution,
      activePendingAction: pendingAction,
      user: currentUser,
    };
  }

  it('returns the current real pendingAction without changing its version or performing a write', async () => {
    const pendingAction = makePendingAction();
    const params = reviewParams(pendingAction);
    pendingActionRepository.findOne.mockResolvedValue(pendingAction);
    executionRepository.findOne.mockResolvedValue({ status: 'running' });
    const result = await review.call(service, params);
    expect(result.execution.status).toBe('waiting_confirmation');
    expect(result.assistantMessage.structuredData).toEqual({
      action: 'prepare_write',
      pendingActionId: 5,
      pendingActionVersion: 3,
    });
    expect(result.assistantMessage.content).toContain('点击“确认录入”');
    expect(pendingActionRepository.findOne).toHaveBeenCalledWith({
      where: { id: 5, sessionId: 9, userId: currentUser.userId },
    });
    expect(pendingAction.version).toBe(3);
    expect(pendingActionRepository.save).not.toHaveBeenCalled();
    expect(productCatalogService.createSkuFromAgent).not.toHaveBeenCalled();
    expect(knowledgeAiChatService.askForAgent).not.toHaveBeenCalled();
  });

  it.each([null, 'cancelled', 'submitted', 'expired'])(
    'does not infer a pendingAction from chat prose or stale state (%s)',
    async (status) => {
      const pendingAction = status
        ? ({ ...makePendingAction(), status } as AgentPendingAction)
        : null;
      pendingActionRepository.findOne.mockResolvedValue(pendingAction);
      executionRepository.findOne.mockResolvedValue({ status: 'running' });
      const result = await review.call(service, reviewParams(pendingAction));
      expect(result.pendingAction).toBeNull();
      expect(result.execution.status).toBe('waiting_input');
      expect(result.assistantMessage.content).toContain(
        '没有可确认的待确认操作',
      );
      expect(pendingActionRepository.save).not.toHaveBeenCalled();
      expect(productCatalogService.createSkuFromAgent).not.toHaveBeenCalled();
      expect(knowledgeAiChatService.askForAgent).not.toHaveBeenCalled();
    },
  );

  it('asks for missing or invalid fields instead of inviting submission', async () => {
    const pendingAction = makePendingAction();
    pendingAction.data.specifications = {};
    pendingActionRepository.findOne.mockResolvedValue(pendingAction);
    executionRepository.findOne.mockResolvedValue({ status: 'running' });
    const result = await review.call(service, reviewParams(pendingAction));
    expect(result.execution.status).toBe('waiting_input');
    expect(result.assistantMessage.content).toContain('待补充');
    expect(productCatalogService.createSkuFromAgent).not.toHaveBeenCalled();
  });

  it('blocks review and the shared write authorization check when a selected command was disabled', async () => {
    const pendingAction = makePendingAction();
    pendingActionRepository.findOne.mockResolvedValue(pendingAction);
    appsService.getExecutableToolKeys.mockResolvedValue(['product.query']);
    await expect(
      review.call(service, reviewParams(pendingAction)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const assertAuthorized = Reflect.get(service, 'assertActionAuthorized') as (
      app: AgentApp,
      key: string,
      user: AuthUser,
    ) => Promise<void>;
    await expect(
      assertAuthorized.call(service, app, 'productSku.create', currentUser),
    ).rejects.toThrow('已停用或不允许聊天调用');
    expect(productCatalogService.createSkuFromAgent).not.toHaveBeenCalled();
  });

  it('distinguishes write-off, no grant and missing employee permissions', () => {
    const reason = Reflect.get(service, 'toolUnavailableReason') as (
      app: AgentApp,
      key: string,
      user: AuthUser,
      executable: string[],
    ) => string | null;
    expect(
      reason.call(
        service,
        { ...app, writeEnabled: false },
        'productSku.create',
        currentUser,
        [],
      ),
    ).toContain('总开关已关闭');
    expect(
      reason.call(
        service,
        { ...app, toolKeys: [] },
        'productSku.create',
        currentUser,
        [],
      ),
    ).toContain('未授权');
    expect(
      reason.call(
        service,
        app,
        'productSku.create',
        { ...currentUser, permissions: ['Product.read'] },
        ['productSku.create'],
      ),
    ).toContain('缺少业务权限');
    expect(reason.call(service, app, 'demo.delete', currentUser, [])).toContain(
      '尚未接通',
    );
  });
});
