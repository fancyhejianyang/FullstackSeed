import { VisualPromptTemplatesService } from './visual-prompt-templates.service';
import type { VisualPromptTask } from './entities/visual-prompt-task.entity';
import type { VisualPromptTemplate } from './entities/visual-prompt-template.entity';

describe('VisualPromptTemplatesService 异步任务', () => {
  const template = {
    id: 5,
    userId: 7,
    version: 3,
    isEnabled: true,
    aiConfigId: 9,
    mediaType: 'image',
    targetModel: 'flux-dev',
    sourcePrompt: 'cinematic portrait',
    sourceNegativePrompt: 'blur',
    positiveTemplate: 'subject, cinematic light',
    negativeTemplate: 'blur, watermark',
    styleSummary: 'cinematic',
    modelRules: 'comma separated',
    variables: ['subject'],
  } as VisualPromptTemplate;

  it('提交提炼时只保存任务，不在请求中调用 AI', async () => {
    const templateRepository = {
      findOne: jest.fn().mockResolvedValue(template),
    };
    const taskRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value: VisualPromptTask) => value),
      save: jest.fn((value: VisualPromptTask) =>
        Promise.resolve({
          ...value,
          id: 11,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
    };
    const providers = { callChat: jest.fn() };
    const service = new VisualPromptTemplatesService(
      templateRepository as never,
      taskRepository as never,
      {} as never,
      providers as never,
    );
    (service as unknown as { stopped: boolean }).stopped = true;

    const task = await service.submitExtraction(5, 7, 'extract-request');

    expect(task).toEqual(
      expect.objectContaining({
        id: 11,
        status: 'pending',
        taskType: 'extract',
      }),
    );
    expect(taskRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'extract-request',
        snapshot: { templateVersion: 3 },
      }),
    );
    expect(providers.callChat).not.toHaveBeenCalled();
  });

  it('后台任务成功后写回转换结果和完成状态', async () => {
    const task = {
      id: 12,
      userId: 7,
      taskType: 'compose',
      templateId: 5,
      workflowId: 4,
      requestId: 'compose-request',
      activeKey: 'compose:7:workflow:4',
      status: 'pending',
      stage: '等待执行',
      snapshot: {
        templateVersion: 3,
        idea: '雨夜城市街道',
        targetModel: 'flux-dev',
      },
    } as VisualPromptTask;
    const update = jest
      .fn<Promise<{ affected: number }>, [unknown, Partial<VisualPromptTask>]>()
      .mockResolvedValueOnce({ affected: 0 })
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValueOnce({ affected: 1 });
    const taskRepository = {
      update,
      findOne: jest.fn().mockResolvedValue(task),
    };
    const providers = {
      withExecutionSignal: jest.fn(
        (_signal: AbortSignal, callback: () => Promise<unknown>) => callback(),
      ),
      callChat: jest.fn().mockResolvedValue({
        isSuccess: true,
        answer: JSON.stringify({
          positivePrompt: 'rainy city street, cinematic lighting',
          negativePrompt: 'blur, watermark',
          notes: '已按模型格式转换',
        }),
      }),
    };
    const service = new VisualPromptTemplatesService(
      { findOne: jest.fn().mockResolvedValue(template) } as never,
      taskRepository as never,
      {
        findUsableVisualPromptConfig: jest.fn().mockResolvedValue({
          providerId: 2,
          model: 'qwen-plus',
          temperature: 0.5,
        }),
      } as never,
      providers as never,
    );

    await (service as unknown as { tick: () => Promise<void> }).tick();

    expect(providers.callChat).toHaveBeenCalledTimes(1);
    const completion = update.mock.calls.at(-1)?.[1];
    expect(completion?.status).toBe('succeeded');
    expect(completion?.stage).toBe('提示词转换完成');
    expect(completion?.activeKey).toBeNull();
    expect(completion?.result?.positivePrompt).toBe(
      'rainy city street, cinematic lighting',
    );
    expect(completion?.result?.negativePrompt).toBe('blur, watermark');
  });

  it('历史提炼结果缺少提示词规则时回退工作流原始提示词', async () => {
    const callChat = jest
      .fn<
        Promise<{ isSuccess: boolean; answer: string }>,
        [{ question: string }]
      >()
      .mockResolvedValue({
        isSuccess: true,
        answer: JSON.stringify({
          positivePrompt: 'new prompt',
          negativePrompt: 'new negative prompt',
          notes: '',
        }),
      });
    const providers = {
      withExecutionSignal: jest.fn(
        (_signal: AbortSignal, callback: () => Promise<unknown>) => callback(),
      ),
      callChat,
    };
    const service = new VisualPromptTemplatesService(
      {} as never,
      {} as never,
      {
        findUsableVisualPromptConfig: jest.fn().mockResolvedValue({
          providerId: 2,
          model: 'qwen-plus',
          temperature: 0.5,
        }),
      } as never,
      providers as never,
    );
    const incomplete = {
      ...template,
      extractedAt: new Date(),
      modelRules: null,
    } as VisualPromptTemplate;

    await (
      service as unknown as {
        composeRow: (
          row: VisualPromptTemplate,
          dto: { idea: string },
          signal: AbortSignal,
        ) => Promise<unknown>;
      }
    ).composeRow(
      incomplete,
      { idea: '雨夜街道' },
      new AbortController().signal,
    );

    const question = JSON.parse(
      callChat.mock.calls[0]?.[0].question ?? '',
    ) as Record<string, unknown>;
    expect(question).toMatchObject({
      positiveTemplate: 'cinematic portrait',
      negativeTemplate: 'blur',
      styleSummary: null,
      modelRules: null,
      variables: null,
    });
  });

  it('历史提炼结果缺少提示词规则时仍保留真实提炼时间', async () => {
    const repository = {
      findAndCount: jest.fn().mockResolvedValue([
        [
          {
            ...template,
            extractedAt: new Date('2026-10-22T00:00:00.000Z'),
            modelRules: null,
            updatedAt: new Date('2026-10-22T00:00:00.000Z'),
          },
        ],
        1,
      ]),
    };
    const service = new VisualPromptTemplatesService(
      repository as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.findAll({ page: 1, pageSize: 10 }, 7);

    expect(result.list[0]?.extractedAt).toEqual(
      new Date('2026-10-22T00:00:00.000Z'),
    );
    expect(result.list[0]).not.toHaveProperty('modelRules');
    expect(result.list[0]).not.toHaveProperty('positiveTemplate');
  });

  it('选择工作流时从原始 JSON 建立总结记录并回写绑定', async () => {
    const templateRepository = {
      create: jest.fn((value: Record<string, unknown>) => value),
      save: jest.fn((value: Record<string, unknown>) =>
        Promise.resolve({ ...value, id: 26 }),
      ),
    };
    const workflowRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          id: 4,
          name: '商品图工作流',
          outputType: 'image',
          targetModel: 'flux-dev',
          apiWorkflow: JSON.stringify({
            '1': {
              class_type: 'CLIPTextEncode',
              inputs: { text: 'product, studio lighting' },
            },
          }),
          inputBindings: [
            {
              key: 'positivePrompt',
              label: '正向提示词',
              type: 'textarea',
              nodeId: '1',
              inputKey: 'text',
              semanticRole: 'positivePrompt',
            },
          ],
        }),
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        String(entity).includes('ComfyWorkflow')
          ? workflowRepository
          : templateRepository,
      ),
    };
    const repository = {
      manager: {
        transaction: jest.fn(
          (callback: (value: typeof manager) => Promise<unknown>) =>
            callback(manager),
        ),
      },
    };
    const service = new VisualPromptTemplatesService(
      repository as never,
      {} as never,
      {
        findUsableVisualPromptConfig: jest.fn().mockResolvedValue({
          id: 6,
          name: '提示词总结配置',
        }),
      } as never,
      {} as never,
    );

    const saved = await service.create(
      {
        workflowId: 4,
        name: '商品图总结',
        mediaType: 'video',
        aiConfigId: 6,
        sourcePrompt: '客户端值不会覆盖工作流原文',
      },
      7,
    );

    expect(saved).toMatchObject({
      id: 26,
      userId: 7,
      mediaType: 'image',
      targetModel: 'flux-dev',
      sourcePrompt: 'product, studio lighting',
      extractedAt: null,
    });
    expect(workflowRepository.update).toHaveBeenCalledWith(4, {
      visualPromptTemplateId: 26,
    });
  });
});
