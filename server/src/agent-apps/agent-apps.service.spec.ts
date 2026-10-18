import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { AI_BUSINESS_COMMAND_CATALOG } from '../ai-command-definitions/ai-command-definitions.constants';
import type { AiCommandDefinitionsService } from '../ai-command-definitions/ai-command-definitions.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import { AGENT_RUNTIME_TOOL_KEYS } from './agent-apps.constants';
import { AgentAppsService } from './agent-apps.service';
import { AgentApp } from './entities/agent-app.entity';
import { normalizeModelRouting } from './agent-model-routing';

const user = (id: number, isAdmin = false): AuthUser => ({
  userId: id,
  username: `user-${id}`,
  isAdmin,
  roles: [],
  permissions: ['AgentWorkspace.read'],
});

describe('AgentAppsService access and tool policy', () => {
  const repository = {
    findOne: jest.fn(),
    find: jest.fn((): Promise<AgentApp[]> => Promise.resolve([])),
    create: jest.fn((value: Partial<AgentApp>): AgentApp => value as AgentApp),
    save: jest.fn(
      (value: AgentApp): Promise<AgentApp> => Promise.resolve(value),
    ),
  };
  const providers = {
    findOne: jest.fn(),
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
    commandDefinitions as unknown as AiCommandDefinitionsService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('rejects foreign media references and a provider switch that retains old references', async () => {
    const app = {
      id: 1,
      providerId: 1,
      models: ['qwen-plus'],
      toolKeys: [],
      mediaModels: {
        vision: { providerId: 1, model: 'vision' },
        imageGeneration: null,
      },
    };
    repository.findOne.mockResolvedValue(app);
    await expect(
      service.update(1, {
        mediaModels: {
          vision: { providerId: 2, model: 'vision' },
          imageGeneration: null,
        },
      }),
    ).rejects.toThrow('当前所选模型账号');
    await expect(service.update(1, { providerId: 2 })).rejects.toThrow(
      '当前所选模型账号',
    );
    expect(repository.save).not.toHaveBeenCalled();
    const cleared = await service.update(1, {
      providerId: 2,
      mediaModels: { vision: null, imageGeneration: null },
    });
    expect(cleared.providerId).toBe(2);
    expect(cleared.mediaModels?.vision).toBeNull();
  });

  it('keeps vision and generation references separate and preserves omitted media settings', async () => {
    providers.findOne.mockResolvedValue({
      id: 2,
      isEnabled: true,
      secretKeySet: true,
      visionModels: 'vision#识图',
      imageGenerationModels: 'image#生图',
      imageGenerationApiUrl: 'https://provider.example/images',
    });
    const references = {
      vision: { providerId: 2, model: 'vision' },
      imageGeneration: { providerId: 2, model: 'image' },
    };
    const created = await service.create({
      name: '助手',
      responsibility: '媒体',
      instructionMarkdown: '识图',
      providerId: 2,
      models: ['qwen-plus'],
      mediaModels: references,
    });
    expect(created.mediaModels).toEqual(references);
    repository.findOne.mockResolvedValue(created);
    const updated = await service.update(1, { name: '改名' });
    expect(updated.mediaModels).toEqual(references);
    const cleared = await service.update(1, {
      mediaModels: {
        vision: null,
        imageGeneration: references.imageGeneration,
      },
    });
    expect(cleared.mediaModels).toEqual({
      vision: null,
      imageGeneration: references.imageGeneration,
    });
    await expect(
      service.update(1, {
        mediaModels: {
          vision: references.imageGeneration,
          imageGeneration: null,
        },
      }),
    ).rejects.toThrow('对应能力目录');
    providers.findOne.mockResolvedValueOnce({
      isEnabled: false,
      secretKeySet: true,
    });
    await expect(
      service.update(1, { mediaModels: references }),
    ).rejects.toThrow('未启用');
  });

  it('requires an explicitly configured generation endpoint before saving a generation reference', async () => {
    providers.findOne.mockResolvedValueOnce({
      isEnabled: true,
      secretKeySet: true,
      imageGenerationModels: 'image',
      imageGenerationApiUrl: '',
    });
    repository.findOne.mockResolvedValue({
      id: 1,
      providerId: 2,
      models: ['qwen-plus'],
      toolKeys: [],
    });
    await expect(
      service.update(1, {
        mediaModels: {
          vision: null,
          imageGeneration: { providerId: 2, model: 'image' },
        },
      }),
    ).rejects.toThrow('生图接口地址');
  });

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
      runtimeAvailable: true,
      unavailableReason: null,
    });
    expect(
      result.businessTools.find((item) => item.commandKey === 'product.query'),
    ).toEqual({
      commandKey: 'product.query',
      name: '产品/SKU 智能查询',
      action: 'read',
      requireApproval: false,
      description: '兼容现有工作台的产品与 SKU 聚合事实查询。',
      runtimeAvailable: true,
      unavailableReason: null,
    });
    expect(
      result.businessTools
        .filter((item) => item.runtimeAvailable)
        .map((item) => item.commandKey),
    ).toEqual(AGENT_RUNTIME_TOOL_KEYS);
  });

  it('creates an Agent with Markdown instructions and no workflow', async () => {
    await expect(
      service.create({
        name: '通用助手',
        responsibility: '进行日常对话',
        instructionMarkdown: '# 工作目标\n\n协助员工处理日常问题。',
        providerId: 1,
        models: ['qwen-plus'],
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        workflowId: null,
        workflowName: null,
        instructionMarkdown: '# 工作目标\n\n协助员工处理日常问题。',
        toolKeys: [],
        modelRouting: normalizeModelRouting(undefined, ['qwen-plus']),
      }),
    );
  });

  it('persists routing configuration and refuses groups outside the approved model list', async () => {
    const dto = {
      name: '调度助手',
      responsibility: '查询分析',
      instructionMarkdown: '# 工作目标',
      providerId: 1,
      models: ['qwen-plus', 'gpt-4o-mini'],
      modelRouting: normalizeModelRouting(
        {
          strategy: 'intent',
          simpleModels: ['gpt-4o-mini'],
          complexModels: ['qwen-plus'],
        },
        ['qwen-plus', 'gpt-4o-mini'],
      ),
    };
    expect(await service.create(dto)).toMatchObject({
      modelRouting: dto.modelRouting,
    });
    repository.save.mockClear();
    await expect(
      service.create({ ...dto, models: ['qwen-plus'] }),
    ).rejects.toThrow('当前模型列表');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('requires an explicit write tool whenever the write switch is enabled', async () => {
    await expect(
      service.create({
        name: '录入助手',
        responsibility: '受控录入',
        instructionMarkdown: '# 工作目标\n\n受控录入业务数据。',
        providerId: 1,
        models: ['qwen-plus'],
        toolKeys: [],
        writeEnabled: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects catalog entries that have no Agent runtime executor', async () => {
    await expect(
      service.create({
        name: '录入助手',
        responsibility: '受控录入',
        instructionMarkdown: '# 业务录入',
        providerId: 1,
        models: ['qwen-plus'],
        toolKeys: ['demo.delete'],
        writeEnabled: true,
      }),
    ).rejects.toThrow('尚未接入 Agent 执行器');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('preserves configured write tools when the write switch is off', async () => {
    await expect(
      service.create({
        name: '只读助手',
        responsibility: '暂不写入',
        instructionMarkdown: '# 业务查询',
        providerId: 1,
        models: ['qwen-plus'],
        toolKeys: ['product.query', 'productSku.create'],
        writeEnabled: false,
      }),
    ).resolves.toMatchObject({
      toolKeys: ['product.query', 'productSku.create'],
      writeEnabled: false,
    });
  });

  it('exposes only executable tools without mutating legacy configuration', async () => {
    const app = {
      id: 1,
      name: '历史应用',
      models: ['qwen-plus'],
      accessScope: 'all',
      allowedUserIds: [],
      isEnabled: true,
      toolKeys: ['product.query', 'demo.create', 'productSku.create'],
      writeEnabled: true,
    } as unknown as AgentApp;
    repository.find.mockResolvedValue([app]);
    await expect(service.getExecutableToolKeys(app)).resolves.toEqual([
      'product.query',
      'demo.create',
      'productSku.create',
    ]);
    await expect(service.findAvailable(user(10))).resolves.toEqual([
      expect.objectContaining({
        models: ['qwen-plus'],
        toolKeys: ['product.query', 'demo.create', 'productSku.create'],
        writeEnabled: true,
      }),
    ]);
    expect(app.toolKeys).toEqual([
      'product.query',
      'demo.create',
      'productSku.create',
    ]);
    app.writeEnabled = false;
    await expect(service.getExecutableToolKeys(app)).resolves.toEqual([
      'product.query',
    ]);
    await expect(service.findAvailable(user(10))).resolves.toEqual([
      expect.objectContaining({
        toolKeys: ['product.query'],
        writeEnabled: false,
      }),
    ]);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rechecks enabled chat-callable commands on every capability lookup', async () => {
    const app = {
      toolKeys: ['product.query', 'productSku.create'],
      writeEnabled: true,
    } as AgentApp;
    await expect(service.getExecutableToolKeys(app)).resolves.toEqual([
      'product.query',
      'productSku.create',
    ]);
    commandDefinitions.findAll.mockResolvedValueOnce({ list: [], total: 0 });
    await expect(service.getExecutableToolKeys(app)).resolves.toEqual([
      'product.query',
    ]);
    expect(commandDefinitions.findAll).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 200,
      chatCallable: true,
      isEnabled: true,
    });
  });

  it('does not clean up old tool selections during an unrelated partial update', async () => {
    const app = {
      id: 1,
      toolKeys: ['demo.create', 'productSku.create'],
      writeEnabled: false,
      accessScope: 'all',
    } as AgentApp;
    const findOne = jest.spyOn(service, 'findOne').mockResolvedValue(app);
    try {
      await expect(
        service.update(1, { name: '修改名称' }),
      ).resolves.toMatchObject({
        name: '修改名称',
        toolKeys: ['demo.create', 'productSku.create'],
        writeEnabled: false,
      });
    } finally {
      findOne.mockRestore();
    }
  });

  it('rejects an executable tool after its command is disabled', async () => {
    commandDefinitions.findAll.mockResolvedValueOnce({ list: [], total: 0 });
    await expect(
      service.create({
        name: '录入助手',
        responsibility: '受控录入',
        instructionMarkdown: '# 业务录入',
        providerId: 1,
        models: ['qwen-plus'],
        toolKeys: ['productSku.create'],
        writeEnabled: true,
      }),
    ).rejects.toThrow('业务工具未启用或不允许聊天调用');
    expect(repository.save).not.toHaveBeenCalled();
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
