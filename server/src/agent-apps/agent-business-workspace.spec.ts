import { BadRequestException } from '@nestjs/common';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { KnowledgeAiChatService } from '../knowledge-ai-chat/knowledge-ai-chat.service';
import type { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import type { ProductCatalogService } from '../product-catalog/product-catalog.service';
import type { AgentAppsService } from './agent-apps.service';
import type { AgentBusinessService } from './agent-business.service';
import { AgentWorkspaceService } from './agent-workspace.service';
import { AgentModelRouterService } from './agent-model-router.service';
import type { AgentMediaService } from './agent-media.service';
import { AgentDraft } from './entities/agent-draft.entity';
import { AgentExecution } from './entities/agent-execution.entity';
import { AgentMessage } from './entities/agent-message.entity';
import { AgentSession } from './entities/agent-session.entity';
import { AgentApp } from './entities/agent-app.entity';

const user: AuthUser = {
  userId: 3,
  username: 'employee',
  isAdmin: false,
  roles: [],
  permissions: ['Demo.create', 'Demo.read'],
};

/** 内存事务桩验证编排边界；不连接数据库、不调用真实模型。 */
function harness(
  mediaIntent?: 'vision' | 'imageGeneration' | 'chat' | 'imageEdit' | 'clarify',
) {
  let draft: AgentDraft = Object.assign(new AgentDraft(), {
    id: 4,
    sessionId: 2,
    userId: 3,
    agentAppId: 1,
    toolKey: 'demo.create',
    version: 2,
    status: 'pending_confirmation',
    data: { title: '任务' },
    missingFields: [],
    validationErrors: [],
    lastExecutionId: null,
  });
  let runs: AgentExecution[] = [];
  let messages: AgentMessage[] = [];
  const matches = (row: object, query: { where: Record<string, unknown> }) =>
    Object.entries(query.where).every(
      ([key, value]) => Reflect.get(row, key) === value,
    );
  const drafts = {
    findOne: jest.fn((query: { where: Record<string, unknown> }) =>
      Promise.resolve(matches(draft, query) ? structuredClone(draft) : null),
    ),
    save: jest.fn((value: AgentDraft) => {
      draft = structuredClone(value);
      return Promise.resolve(value);
    }),
    create: jest.fn((value: Partial<AgentDraft>) => ({ ...value, id: 4 })),
  };
  const executions = {
    update: jest.fn(
      (where: Record<string, unknown>, value: Partial<AgentExecution>) => {
        const run = runs.find((item) => matches(item, { where }));
        if (run) Object.assign(run, value);
        return Promise.resolve({ affected: run ? 1 : 0 });
      },
    ),
    findOne: jest.fn((query: { where: Record<string, unknown> }) =>
      Promise.resolve(runs.find((run) => matches(run, query)) ?? null),
    ),
    create: jest.fn((value: Partial<AgentExecution>) => ({
      ...value,
      id: runs.length + 1,
    })),
    save: jest.fn((value: AgentExecution) => {
      runs = [
        ...runs.filter((item) => item.id !== value.id),
        structuredClone(value),
      ];
      return Promise.resolve(value);
    }),
    count: jest.fn().mockResolvedValue(0),
  };
  const chats = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn((query: { where: Record<string, unknown> }) =>
      Promise.resolve(
        messages.find((message) => matches(message, query)) ?? null,
      ),
    ),
    create: jest.fn((value: Partial<AgentMessage>) => ({
      ...value,
      id: messages.length + 1,
    })),
    save: jest.fn((value: AgentMessage) => {
      messages.push(value);
      return Promise.resolve(value);
    }),
  };
  const sessions = {
    findOne: jest.fn().mockResolvedValue({
      id: 2,
      userId: 3,
      agentAppId: 1,
      status: 'active',
      messageCount: 0,
    }),
    increment: jest.fn(),
    update: jest.fn(),
  };
  const manager = {
    getRepository: (entity: unknown) =>
      entity === AgentDraft
        ? drafts
        : entity === AgentExecution
          ? executions
          : entity === AgentMessage
            ? chats
            : sessions,
  } as unknown as EntityManager;
  const transaction = jest.fn(
    async (run: (manager: EntityManager) => Promise<unknown>) => {
      const backup = structuredClone({ draft, runs, messages });
      try {
        return await run(manager);
      } catch (error) {
        ({ draft, runs, messages } = backup);
        throw error;
      }
    },
  );
  const app = {
    id: 1,
    toolKeys: ['demo.create', 'demo.list'],
    writeEnabled: true,
    maxConcurrentRuns: 1,
    maxToolCalls: 5,
    timeoutSeconds: 60,
    providerId: 1,
    models: ['test-model'],
    responsibility: '助手',
    instructionMarkdown: '处理业务',
    ...(mediaIntent
      ? {
          mediaModels: {
            vision: { providerId: 1, model: 'vision-model' },
            imageGeneration: { providerId: 1, model: 'image-model' },
          },
        }
      : {}),
  } as AgentApp;
  const apps = {
    findAvailableOne: jest.fn().mockResolvedValue(app),
    getExecutableToolKeys: jest.fn().mockResolvedValue(app.toolKeys),
  };
  const business = {
    permissionError: jest.fn().mockReturnValue(null),
    form: jest.fn().mockResolvedValue({ name: '示例数据', fields: [] }),
    create: jest.fn().mockResolvedValue({ id: 99 }),
    query: jest.fn().mockResolvedValue({
      toolKey: 'demo.list',
      name: '示例数据',
      list: [{ id: 5, title: '实际记录' }],
      total: 1,
    }),
    validate: jest.fn((_key: string, data: Record<string, unknown>) => ({
      data,
      missingFields: [],
      validationErrors: [],
    })),
  };
  const models = {
    withExecutionSignal: jest.fn(
      (_signal: AbortSignal, run: () => Promise<unknown>) => run(),
    ),
    callChat: jest.fn().mockResolvedValue({
      isSuccess: true,
      answer: JSON.stringify({
        intent: 'chat',
        complexity: 'simple',
        mode: mediaIntent,
        prompt: '商品宣传海报',
      }),
    }),
  };
  const media = {
    run: jest.fn().mockResolvedValue({
      content: '图片已生成',
      images: [
        { id: 9, mimeType: 'image/png', size: 100, source: 'generated' },
      ],
      providerId: 1,
      model: 'image-model',
    }),
    cancel: jest.fn(),
    read: jest.fn().mockResolvedValue({
      id: 9,
      mimeType: 'image/png',
      size: 100,
      source: 'upload',
    }),
    reference: jest.fn((image: unknown) => image),
  };
  const service = new AgentWorkspaceService(
    sessions as unknown as Repository<AgentSession>,
    chats as unknown as Repository<AgentMessage>,
    drafts as unknown as Repository<AgentDraft>,
    executions as unknown as Repository<AgentExecution>,
    { transaction } as unknown as DataSource,
    apps as unknown as AgentAppsService,
    {} as KnowledgeAiChatService,
    {} as ProductCatalogService,
    business as unknown as AgentBusinessService,
    models as unknown as KnowledgeAiProvidersService,
    new AgentModelRouterService(
      models as unknown as KnowledgeAiProvidersService,
    ),
    media as unknown as AgentMediaService,
  );
  return {
    service,
    media,
    sessions,
    business,
    apps,
    app,
    manager,
    models,
    executions,
    drafts,
    transaction,
    get draft() {
      return draft;
    },
    get runs() {
      return runs;
    },
  };
}

describe('generic Agent workflow and confirmation', () => {
  it('routes an attached picture without a client mode and never writes business data', async () => {
    const h = harness('vision');
    const result = await h.service.sendMessage(
      2,
      { content: '识别这个图片', imageId: 9, clientMessageId: 'auto-vision' },
      user,
    );
    expect(result.execution).toMatchObject({
      status: 'succeeded',
      toolKey: 'media.vision',
    });
    expect(h.media.run).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'vision', imageId: 9 }),
    );
    expect(h.business.create).not.toHaveBeenCalled();
    expect(h.drafts.save).not.toHaveBeenCalled();
  });

  it('uses a fixed text model for intent classification while keeping vision on its dedicated model', async () => {
    const h = harness('vision');
    h.app.models = ['test-model', 'chosen-text-model'];
    h.media.run.mockResolvedValueOnce({
      content: '图片识别完成',
      images: [],
      providerId: 1,
      model: 'vision-model',
    });
    const result = await h.service.sendMessage(
      2,
      {
        content: '识别这个图片',
        imageId: 9,
        textModel: 'chosen-text-model',
        clientMessageId: 'fixed-text-vision',
      },
      user,
    );
    expect(h.models.callChat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'chosen-text-model' }),
    );
    expect(h.media.run).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'vision', imageId: 9 }),
    );
    expect(result.execution?.result).toMatchObject({ model: 'vision-model' });
    expect(result.execution?.parameterSummary?.modelRouting).toMatchObject({
      strategy: 'fixed',
      selectedModel: 'chosen-text-model',
    });
  });

  it('rejects a fixed text model outside the current Agent before creating an execution', async () => {
    const h = harness('vision');
    await expect(
      h.service.sendMessage(
        2,
        {
          content: '识别这个图片',
          imageId: 9,
          textModel: 'foreign-model',
          clientMessageId: 'foreign-text-model',
        },
        user,
      ),
    ).rejects.toThrow('已授权模型');
    expect(h.runs).toHaveLength(0);
    expect(h.models.callChat).not.toHaveBeenCalled();
    expect(h.media.run).not.toHaveBeenCalled();
  });

  it.each(['如何生成图片？', '不要生图，查示例列表', '只写图片提示词'])(
    'ignores a forged legacy mode when classified as ordinary conversation: %s',
    async (content) => {
      const h = harness('chat');
      h.models.callChat
        .mockResolvedValueOnce({
          isSuccess: true,
          answer: JSON.stringify({
            intent: 'query',
            complexity: 'simple',
            mode: 'chat',
          }),
        })
        .mockResolvedValueOnce({
          isSuccess: true,
          answer: JSON.stringify({
            kind: 'tool',
            toolKey: 'demo.list',
            parameters: {},
          }),
        });
      const result = await h.service.sendMessage(
        2,
        { content, mode: 'imageGeneration', clientMessageId: 'ordinary' },
        user,
      );
      expect(result.execution?.status).toBe('succeeded');
      expect(h.media.run).not.toHaveBeenCalled();
      expect(h.business.query).toHaveBeenCalled();
    },
  );

  it.each([
    ['vision', undefined, '请先在输入框'],
    ['imageEdit', 9, '尚未接通'],
    ['imageGeneration', 9, '尚未接通'],
    ['clarify', undefined, '请明确'],
  ] as const)(
    'does not execute images when %s is not executable',
    async (mode, imageId, message) => {
      const h = harness(mode);
      const result = await h.service.sendMessage(
        2,
        { content: '处理一下', imageId, clientMessageId: 'guard' },
        user,
      );
      expect(result.execution?.status).toBe('waiting_input');
      expect(
        'assistantMessage' in result && result.assistantMessage?.content,
      ).toContain(message);
      expect(h.media.run).not.toHaveBeenCalled();
      expect(h.drafts.save).not.toHaveBeenCalled();
    },
  );

  it('does not dispatch media or business tools on malformed classification', async () => {
    const h = harness('imageGeneration');
    h.models.callChat.mockResolvedValue({
      isSuccess: true,
      answer: 'not JSON',
    });
    const result = await h.service.sendMessage(
      2,
      { content: '生成海报', clientMessageId: 'bad-intent' },
      user,
    );
    expect(result.execution?.status).toBe('failed');
    expect(h.media.run).not.toHaveBeenCalled();
    expect(h.business.query).not.toHaveBeenCalled();
  });

  it('does not call media or cancel an unrelated draft when stopped during classification', async () => {
    const h = harness('imageGeneration');
    h.models.callChat.mockImplementationOnce(async () => {
      await h.service.stopExecution(h.runs[0].id, user);
      return {
        isSuccess: true,
        answer: JSON.stringify({
          intent: 'chat',
          complexity: 'simple',
          mode: 'imageGeneration',
          prompt: '海报',
        }),
      };
    });
    const result = await h.service.sendMessage(
      2,
      { content: '生成海报', clientMessageId: 'stop-intent' },
      user,
    );
    expect(result.execution?.status).toBe('cancelled');
    expect(h.media.run).not.toHaveBeenCalled();
    expect(h.draft.status).toBe('pending_confirmation');
  });

  it('generates images once per message id without running business tools or touching an active draft', async () => {
    const h = harness('imageGeneration');
    const payload = {
      content: '生成商品海报',
      clientMessageId: 'image-1',
    };
    const result = await h.service.sendMessage(2, payload, user);
    expect(result.execution).toMatchObject({
      toolKey: 'media.imageGeneration',
      status: 'succeeded',
      draftId: null,
    });
    expect(result.execution?.result).toMatchObject({
      images: [
        { id: 9, mimeType: 'image/png', size: 100, source: 'generated' },
      ],
    });
    await h.service.sendMessage(2, payload, user);
    expect(h.media.run).toHaveBeenCalledTimes(1);
    expect(h.business.create).not.toHaveBeenCalled();
    expect(h.models.callChat).toHaveBeenCalledTimes(1);
    expect(h.drafts.save).not.toHaveBeenCalled();
  });

  it('does not revive a stopped media execution when a provider returns late', async () => {
    const h = harness('imageGeneration');
    h.media.run.mockImplementationOnce(
      async (params: { executionId: number }) => {
        await h.service.stopExecution(params.executionId, user);
        return {
          content: 'late',
          images: [],
          providerId: 1,
          model: 'image-model',
        };
      },
    );
    const result = await h.service.sendMessage(
      2,
      {
        mode: 'imageGeneration',
        content: '生成海报',
        clientMessageId: 'image-stop',
      },
      user,
    );
    expect(result.execution?.status).toBe('cancelled');
    expect(h.media.cancel).toHaveBeenCalled();
    expect(h.draft.status).toBe('pending_confirmation');
  });

  it('checks attachment ownership before accepting a vision message', async () => {
    const h = harness();
    h.media.read.mockRejectedValueOnce(
      new BadRequestException('图片不属于当前会话'),
    );
    await expect(
      h.service.sendMessage(
        2,
        {
          mode: 'vision',
          imageId: 9,
          content: '识别此图',
          clientMessageId: 'vision-1',
        },
        user,
      ),
    ).rejects.toThrow('图片不属于当前会话');
    expect(h.media.read).toHaveBeenCalledWith(9, 2, user.userId);
    expect(h.media.run).not.toHaveBeenCalled();
    expect(h.runs).toHaveLength(0);
  });
  it('guides confirmation without a real draft using current module capabilities, not SKU-only wording', async () => {
    const h = harness();
    const execution = Object.assign(new AgentExecution(), {
      id: 30,
      status: 'running',
      toolCallCount: 0,
    });
    await h.executions.save(execution);
    const params = {
      decision: {
        type: 'clarify',
        queryBeforeWrite: false,
        writeIntent: 'review',
      },
      session: Object.assign(new AgentSession(), { id: 2, messageCount: 0 }),
      app: h.app,
      execution,
      activeDraft: null,
      user,
    };
    const review = Reflect.get(h.service, 'processWriteReview') as (
      p: typeof params,
    ) => Promise<{ assistantMessage: AgentMessage }>;
    const result = await review.call(h.service, params);
    expect(result.assistantMessage.content).toContain('创建示例数据');
    expect(result.assistantMessage.content).not.toContain('productSku.create');
    expect(h.models.callChat).not.toHaveBeenCalled();
    expect(h.business.create).not.toHaveBeenCalled();
  });
  it('commits a real receipt with the same manager and replays the same idempotency key', async () => {
    const h = harness();
    const dto = { version: 2, idempotencyKey: 'test-one' };
    const first = await h.service.confirmDraft(4, dto, user);
    const second = await h.service.confirmDraft(4, dto, user);
    expect(h.business.create).toHaveBeenCalledTimes(1);
    expect(h.business.create).toHaveBeenCalledWith(
      'demo.create',
      { title: '任务' },
      user,
      h.manager,
    );
    expect(first.execution.result).toEqual({
      recordType: 'demo',
      recordId: 99,
      detailPath: '/demo',
    });
    expect(second.execution.id).toBe(first.execution.id);
    expect(h.draft.status).toBe('submitted');
    await expect(
      h.service.confirmDraft(4, { ...dto, idempotencyKey: 'new-key' }, user),
    ).rejects.toThrow('草稿已提交');
    expect(h.business.create).toHaveBeenCalledTimes(1);
  });

  it('rejects old versions, foreign owners, write-off and withdrawn grants before writing', async () => {
    const h = harness();
    await expect(
      h.service.confirmDraft(4, { version: 1, idempotencyKey: 'old' }, user),
    ).rejects.toThrow('版本变化');
    await expect(
      h.service.confirmDraft(
        4,
        { version: 2, idempotencyKey: 'foreign' },
        { ...user, userId: 44 },
      ),
    ).rejects.toThrow('草稿不存在');
    h.app.writeEnabled = false;
    await expect(
      h.service.confirmDraft(4, { version: 2, idempotencyKey: 'off' }, user),
    ).rejects.toThrow('总开关已关闭');
    h.app.writeEnabled = true;
    h.apps.getExecutableToolKeys.mockResolvedValue([]);
    await expect(
      h.service.confirmDraft(
        4,
        { version: 2, idempotencyKey: 'withdrawn' },
        user,
      ),
    ).rejects.toThrow('已停用');
    expect(h.business.create).not.toHaveBeenCalled();
  });

  it('records a failed outcome after business rollback, never a fabricated success receipt', async () => {
    const h = harness();
    h.business.create.mockRejectedValue(
      new BadRequestException('业务校验未通过'),
    );
    const result = await h.service.confirmDraft(
      4,
      { version: 2, idempotencyKey: 'fail' },
      user,
    );
    expect(result.execution.status).toBe('failed');
    expect(result.execution.result).toBeNull();
    expect(h.draft.status).toBe('failed');
    expect(h.runs).toHaveLength(1);
    expect(h.transaction).toHaveBeenCalledTimes(2);
  });

  it('routes semantic queries and create drafts without executing a write', async () => {
    const h = harness();
    h.app.maxToolCalls = 1;
    const execution = Object.assign(new AgentExecution(), {
      id: 30,
      status: 'running',
      toolCallCount: 0,
    });
    await h.executions.save(execution);
    const params = {
      content: '查找任务',
      session: Object.assign(new AgentSession(), { id: 2, messageCount: 0 }),
      app: h.app,
      execution,
      activeDraft: null,
      user,
    };
    const process = Reflect.get(h.service, 'processBusinessAction') as (
      p: typeof params,
    ) => Promise<{ execution: AgentExecution; draft?: AgentDraft }>;
    h.models.callChat.mockResolvedValue({
      isSuccess: true,
      answer:
        '{"kind":"tool","toolKey":"demo.list","parameters":{"keyword":"任务"}}',
    });
    const query = await process.call(h.service, params);
    expect(
      h.executions.update.mock.calls
        .map(([, value]) => value.parameterSummary?.progressStage)
        .filter(
          (stage, index, stages) => index === 0 || stage !== stages[index - 1],
        ),
    ).toEqual(['understanding', 'querying']);
    expect(h.business.query).toHaveBeenCalledWith(
      'demo.list',
      { keyword: '任务' },
      user,
    );
    expect(query.execution.status).toBe('succeeded');
    expect(query.execution.toolCallCount).toBe(1);
    execution.status = 'running';
    execution.toolCallCount = 0;
    await h.executions.save(execution);
    h.models.callChat.mockResolvedValue({
      isSuccess: true,
      answer:
        '{"kind":"tool","toolKey":"demo.create","parameters":{"title":"新任务"}}',
    });
    const create = await process.call(h.service, {
      ...params,
      content: '录入新任务',
    });
    expect(create.draft?.data).toEqual({ title: '新任务' });
    expect(create.execution.status).toBe('waiting_confirmation');
    expect(
      h.executions.update.mock.calls
        .map(([, value]) => value.parameterSummary?.progressStage)
        .filter(
          (stage, index, stages) => index === 0 || stage !== stages[index - 1],
        ),
    ).toEqual([
      'understanding',
      'querying',
      'understanding',
      'preparing_draft',
    ]);
    expect(h.business.create).not.toHaveBeenCalled();
  });
});
