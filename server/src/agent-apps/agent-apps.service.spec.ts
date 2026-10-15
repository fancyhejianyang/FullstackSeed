import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { AI_BUSINESS_COMMAND_CATALOG } from '../ai-command-definitions/ai-command-definitions.constants';
import type { AiCommandDefinitionsService } from '../ai-command-definitions/ai-command-definitions.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { AiWorkflowsService } from '../ai-workflows/ai-workflows.service';
import type { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
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
  const providers = {
    findAll: jest.fn(() =>
      Promise.resolve({
        list: [
          {
            id: 1,
            name: '模型账号',
            models: 'qwen-plus#通义千问 Plus',
            textModels: 'qwen-plus#重复名称\ngpt-4o-mini#GPT-4o Mini',
            secretKeySet: true,
          },
        ],
        total: 1,
      }),
    ),
    resolveChatTarget: jest.fn(({ id, model }: { id: number; model: string }) =>
      Promise.resolve({ providerId: id, providerName: '模型账号', model }),
    ),
  };
  const workflows = {
    findAll: jest.fn(() =>
      Promise.resolve({ list: [{ id: 2, name: '知识工作流' }], total: 1 }),
    ),
    findUsable: jest.fn(() => Promise.resolve({ id: 2, name: '知识工作流' })),
  };
  const commandDefinitions = {
    findAll: jest.fn(() =>
      Promise.resolve({
        list: AI_BUSINESS_COMMAND_CATALOG.filter((item) => item.chatCallable),
        total: AI_BUSINESS_COMMAND_CATALOG.filter((item) => item.chatCallable)
          .length,
      }),
    ),
  };
  const service = new AgentAppsService(
    repository as unknown as Repository<AgentApp>,
    providers as unknown as KnowledgeAiProvidersService,
    workflows as unknown as AiWorkflowsService,
    commandDefinitions as unknown as AiCommandDefinitionsService,
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

  it('merges generic and text model lists with complete de-duplicated labels', async () => {
    const result = await service.getConfigurationOptions();
    expect(result.providers).toEqual([
      {
        id: 1,
        name: '模型账号',
        models: [
          { value: 'qwen-plus', text: '通义千问 Plus（qwen-plus）' },
          { value: 'gpt-4o-mini', text: 'GPT-4o Mini（gpt-4o-mini）' },
        ],
      },
    ]);
    expect(result.workflows).toEqual([{ id: 2, name: '知识工作流' }]);
    expect(result.businessTools.map((item) => item.commandKey)).toEqual([
      'product.query',
      ...AI_BUSINESS_COMMAND_CATALOG.filter((item) => item.chatCallable).map(
        (item) => item.commandKey,
      ),
    ]);
    expect(
      result.businessTools.find((item) => item.commandKey === 'demo.create'),
    ).toMatchObject({
      commandKey: 'demo.create',
      name: '创建示例数据',
      action: 'create',
      requireApproval: true,
    });
    expect(
      result.businessTools.find((item) => item.commandKey === 'product.query'),
    ).toEqual({
      commandKey: 'product.query',
      name: '产品/SKU 智能查询',
      action: 'read',
      requireApproval: false,
      description: '兼容现有工作台的产品与 SKU 聚合事实查询。',
    });
  });

  it('creates a pure model Agent without a workflow or business tools', async () => {
    await expect(
      service.create({
        name: '通用助手',
        responsibility: '进行日常对话',
        providerId: 1,
        models: ['qwen-plus'],
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        workflowId: null,
        workflowName: null,
        toolKeys: [],
      }),
    );
    expect(workflows.findUsable).not.toHaveBeenCalled();
  });

  it('requires an explicit write tool whenever the write switch is enabled', async () => {
    await expect(
      service.create({
        name: '录入助手',
        responsibility: '受控录入',
        providerId: 1,
        models: ['qwen-plus'],
        workflowId: 2,
        toolKeys: [],
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
