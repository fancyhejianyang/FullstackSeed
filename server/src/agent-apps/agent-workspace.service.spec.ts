import { ConflictException, NotFoundException } from '@nestjs/common';
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
  const service = new AgentWorkspaceService(
    sessionRepository as unknown as Repository<AgentSession>,
    messageRepository as unknown as Repository<AgentMessage>,
    draftRepository as unknown as Repository<AgentDraft>,
    executionRepository as unknown as Repository<AgentExecution>,
    {} as DataSource,
    {} as AgentAppsService,
    knowledgeAiChatService as unknown as KnowledgeAiChatService,
    {} as ProductCatalogService,
  );

  beforeEach(() => jest.clearAllMocks());

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
    ) as (action: string, app: { workflowId: number | null }) => string;

    expect(resolveBusinessToolKey.call(service, 'answer')).toBeNull();
    expect(resolveBusinessToolKey.call(service, 'clarify')).toBeNull();
    expect(resolveBusinessToolKey.call(service, 'query')).toBe('product.query');
    expect(
      resolveExecutionToolKey.call(service, 'answer', { workflowId: null }),
    ).toBe('model.chat');
    expect(
      resolveExecutionToolKey.call(service, 'answer', { workflowId: 3 }),
    ).toBe('knowledge.answer');
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
        workflowId: number | null;
        responsibility: string;
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
        workflowId: null,
        responsibility: '产品助手',
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
});
