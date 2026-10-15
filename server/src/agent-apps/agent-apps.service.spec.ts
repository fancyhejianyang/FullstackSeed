import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import type { AiWorkflowsService } from '../ai-workflows/ai-workflows.service';
import { AgentAppsService } from './agent-apps.service';
import { AgentApp } from './entities/agent-app.entity';

const user = (id: number, isAdmin = false): AuthUser => ({
  userId: id,
  username: `user-${id}`,
  isAdmin,
  roles: [],
  permissions: ['AgentWorkspace.read'],
});

describe('AgentAppsService access and tool policy', () => {
  const repository = {
    find: jest.fn((): Promise<AgentApp[]> => Promise.resolve([])),
    create: jest.fn((value: Partial<AgentApp>): AgentApp => value as AgentApp),
    save: jest.fn(
      (value: AgentApp): Promise<AgentApp> => Promise.resolve(value),
    ),
  };
  const features = {
    findUsableChatConfig: jest.fn(() =>
      Promise.resolve({ id: 1, name: '聊天配置' }),
    ),
  };
  const workflows = {
    findUsable: jest.fn(() => Promise.resolve({ id: 2, name: '知识工作流' })),
  };
  const service = new AgentAppsService(
    repository as unknown as Repository<AgentApp>,
    features as unknown as AiFeatureConfigsService,
    workflows as unknown as AiWorkflowsService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('filters user-scoped apps while allowing administrators', async () => {
    repository.find.mockResolvedValue([
      {
        id: 1,
        name: '全员',
        accessScope: 'all',
        allowedUserIds: [],
        isEnabled: true,
      } as unknown as AgentApp,
      {
        id: 2,
        name: '指定',
        accessScope: 'users',
        allowedUserIds: [20],
        isEnabled: true,
      } as unknown as AgentApp,
    ]);
    await expect(service.findAvailable(user(10))).resolves.toEqual([
      expect.objectContaining({ id: 1 }),
    ]);
    await expect(service.findAvailable(user(10, true))).resolves.toHaveLength(
      2,
    );
  });

  it('requires an explicit write tool whenever the write switch is enabled', async () => {
    await expect(
      service.create({
        name: '录入助手',
        responsibility: '受控录入',
        aiFeatureConfigId: 1,
        workflowId: 2,
        toolKeys: ['knowledge.answer'],
        writeEnabled: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects users outside a restricted app even when they have workspace access', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 2,
      isEnabled: true,
      accessScope: 'users',
      allowedUserIds: [20],
    } as AgentApp);
    await expect(service.findAvailableOne(2, user(10))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
