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
});
