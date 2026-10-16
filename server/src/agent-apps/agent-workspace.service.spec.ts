import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { KnowledgeAiChatService } from '../knowledge-ai-chat/knowledge-ai-chat.service';
import type { ProductCatalogService } from '../product-catalog/product-catalog.service';
import type { AgentAppsService } from './agent-apps.service';
import { AgentWorkspaceService } from './agent-workspace.service';
import { AgentDraft } from './entities/agent-draft.entity';
import { AgentExecution } from './entities/agent-execution.entity';
import { AgentMessage } from './entities/agent-message.entity';
import { AgentSession } from './entities/agent-session.entity';
import { AgentApp } from './entities/agent-app.entity';
import { classifyAgentAction } from './agent-action';

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
    create: jest.fn((value: Partial<AgentMessage>) => value),
    save: jest.fn((value: AgentMessage) =>
      Promise.resolve({ ...value, id: 88 }),
    ),
  };
  const draftRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const executionRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const knowledgeAiChatService = {
    askForAgent: jest.fn(),
  };
  const appsService = { getExecutableToolKeys: jest.fn() };
  const productCatalogService = { createSkuFromAgent: jest.fn() };
  const service = new AgentWorkspaceService(
    sessionRepository as unknown as Repository<AgentSession>,
    messageRepository as unknown as Repository<AgentMessage>,
    draftRepository as unknown as Repository<AgentDraft>,
    executionRepository as unknown as Repository<AgentExecution>,
    {} as DataSource,
    appsService as unknown as AgentAppsService,
    knowledgeAiChatService as unknown as KnowledgeAiChatService,
    productCatalogService as unknown as ProductCatalogService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    appsService.getExecutableToolKeys.mockResolvedValue([
      'product.query',
      'productSku.create',
    ]);
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

  it('invalidates confirmation when the draft version has changed', async () => {
    draftRepository.findOne.mockResolvedValue({
      id: 5,
      userId: currentUser.userId,
      status: 'pending_confirmation',
      version: 3,
    });
    await expect(
      service.updateDraft(5, { version: 2, data: {} }, currentUser),
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
    expect(systemPrompt).toContain('可生成 SKU 草稿');
    expect(systemPrompt).toContain('当前会话没有待确认的真实录入草稿');
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
    );
    expect(knowledgeAiChatService.askForAgent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ providerId: 3, model: 'fallback-model' }),
      expect.any(Object),
    );
    expect(execution.status).toBe('succeeded');
    expect(execution.toolCallCount).toBe(2);
  });

  const app = {
    id: 1,
    toolKeys: ['product.query', 'productSku.create'],
    writeEnabled: true,
  } as AgentApp;
  const makeDraft = (): AgentDraft =>
    Object.assign(new AgentDraft(), {
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
    activeDraft: AgentDraft | null;
    user: AuthUser;
  };
  const review = Reflect.get(service, 'processWriteReview') as (
    params: ReviewParams,
  ) => Promise<{
    assistantMessage: AgentMessage;
    execution: AgentExecution;
    draft: AgentDraft | null;
  }>;
  function reviewParams(draft: AgentDraft | null): ReviewParams {
    return {
      decision: classifyAgentAction('符合，可以入库', Boolean(draft)),
      session: { id: 9, messageCount: 1 } as AgentSession,
      app,
      execution: {
        id: 7,
        toolKey: 'model.chat',
        status: 'running',
        toolCallCount: 0,
      } as AgentExecution,
      activeDraft: draft,
      user: currentUser,
    };
  }

  it('returns the current real draft without changing its version or performing a write', async () => {
    const draft = makeDraft();
    const params = reviewParams(draft);
    draftRepository.findOne.mockResolvedValue(draft);
    executionRepository.findOne.mockResolvedValue({ status: 'running' });
    const result = await review.call(service, params);
    expect(result.execution.status).toBe('waiting_confirmation');
    expect(result.assistantMessage.structuredData).toEqual({
      action: 'prepare_write',
      draftId: 5,
      draftVersion: 3,
    });
    expect(result.assistantMessage.content).toContain('点击“确认录入”');
    expect(draftRepository.findOne).toHaveBeenCalledWith({
      where: { id: 5, sessionId: 9, userId: currentUser.userId },
    });
    expect(draft.version).toBe(3);
    expect(draftRepository.save).not.toHaveBeenCalled();
    expect(productCatalogService.createSkuFromAgent).not.toHaveBeenCalled();
    expect(knowledgeAiChatService.askForAgent).not.toHaveBeenCalled();
  });

  it.each([null, 'cancelled', 'submitted', 'expired'])(
    'does not infer a draft from chat prose or stale state (%s)',
    async (status) => {
      const draft = status ? ({ ...makeDraft(), status } as AgentDraft) : null;
      draftRepository.findOne.mockResolvedValue(draft);
      executionRepository.findOne.mockResolvedValue({ status: 'running' });
      const result = await review.call(service, reviewParams(draft));
      expect(result.draft).toBeNull();
      expect(result.execution.status).toBe('waiting_input');
      expect(result.assistantMessage.content).toContain('没有可确认的录入草稿');
      expect(draftRepository.save).not.toHaveBeenCalled();
      expect(productCatalogService.createSkuFromAgent).not.toHaveBeenCalled();
      expect(knowledgeAiChatService.askForAgent).not.toHaveBeenCalled();
    },
  );

  it('asks for missing or invalid fields instead of inviting submission', async () => {
    const draft = makeDraft();
    draft.data.specifications = {};
    draftRepository.findOne.mockResolvedValue(draft);
    executionRepository.findOne.mockResolvedValue({ status: 'running' });
    const result = await review.call(service, reviewParams(draft));
    expect(result.execution.status).toBe('waiting_input');
    expect(result.assistantMessage.content).toContain('待补充');
    expect(productCatalogService.createSkuFromAgent).not.toHaveBeenCalled();
  });

  it('blocks review and the shared write authorization check when a selected command was disabled', async () => {
    const draft = makeDraft();
    draftRepository.findOne.mockResolvedValue(draft);
    appsService.getExecutableToolKeys.mockResolvedValue(['product.query']);
    await expect(
      review.call(service, reviewParams(draft)),
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
    expect(reason.call(service, app, 'demo.create', currentUser, [])).toContain(
      '尚未接通',
    );
  });
});
