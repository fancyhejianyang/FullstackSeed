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
  };
  const messageRepository = { find: jest.fn() };
  const draftRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const executionRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const service = new AgentWorkspaceService(
    sessionRepository as unknown as Repository<AgentSession>,
    messageRepository as unknown as Repository<AgentMessage>,
    draftRepository as unknown as Repository<AgentDraft>,
    executionRepository as unknown as Repository<AgentExecution>,
    {} as DataSource,
    {} as AgentAppsService,
    {} as KnowledgeAiChatService,
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
});
