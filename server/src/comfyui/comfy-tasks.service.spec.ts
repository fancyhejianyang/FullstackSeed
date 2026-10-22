import { ComfyTasksService } from './comfy-tasks.service';
import type { ComfyTask } from './entities/comfy-task.entity';

describe('ComfyUI 任务运行快照', () => {
  it('工作流保留原提示词，但创建任务时清空并只保存本次参数', async () => {
    const taskRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value: ComfyTask) => value),
      save: jest.fn((value: ComfyTask) =>
        Promise.resolve({ ...value, id: 18 }),
      ),
    };
    const service = new ComfyTasksService(
      taskRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {
        getRunnableVersion: jest.fn().mockResolvedValue({
          workflow: { id: 3 },
          version: {
            id: 7,
            connectionId: 2,
            outputType: 'image',
            apiWorkflow: JSON.stringify({
              '1': {
                class_type: 'CLIPTextEncode',
                inputs: { text: 'original workflow prompt' },
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
                required: true,
              },
            ],
          },
        }),
      } as never,
      {
        getWithSecret: jest.fn().mockResolvedValue({ isEnabled: true }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 18 } as ComfyTask);
    jest
      .spyOn(service as unknown as { tick: () => Promise<void> }, 'tick')
      .mockResolvedValue();

    await service.create(9, {
      workflowId: 3,
      requestId: 'runtime-snapshot',
      parameters: { positivePrompt: 'current generated prompt' },
    });

    const saved = taskRepository.save.mock.calls[0]?.[0];
    const graph = JSON.parse(String(saved?.workflowSnapshot)) as Record<
      string,
      { inputs: Record<string, unknown> }
    >;
    expect(graph['1'].inputs.text).toBe('');
    expect(saved?.parameterSnapshot).toEqual({
      positivePrompt: 'current generated prompt',
    });
  });

  it('失败任务重新执行时创建独立排队任务并保留原记录', async () => {
    const source = {
      id: 18,
      userId: 9,
      workflowId: 3,
      workflowVersionId: 7,
      connectionId: 2,
      outputType: 'image',
      status: 'failed',
      errorMessage: 'cloud rejected request',
      parameterSnapshot: { prompt: 'a cat' },
      workflowSnapshot: '{"1":{"class_type":"SaveImage","inputs":{}}}',
      bindingSnapshot: [
        { key: 'prompt', nodeId: '1', inputKey: 'text', type: 'textarea' },
      ],
    } as ComfyTask;
    const queryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(source),
    };
    const taskRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value: ComfyTask) => value),
      save: jest.fn((value: ComfyTask) =>
        Promise.resolve({ ...value, id: 19 }),
      ),
    };
    const connections = {
      getWithSecret: jest.fn().mockResolvedValue({ isEnabled: true }),
    };
    const service = new ComfyTasksService(
      taskRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      connections as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 19 } as ComfyTask);
    jest
      .spyOn(service as unknown as { tick: () => Promise<void> }, 'tick')
      .mockResolvedValue();

    await service.retry(18, 9, 'retry-request');

    expect(taskRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 3,
        workflowVersionId: 7,
        connectionId: 2,
        requestId: 'retry-request',
        status: 'pending',
        stage: '等待重新执行',
        parameterSnapshot: { prompt: 'a cat' },
        promptId: null,
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
      }),
    );
    expect(source.status).toBe('failed');
    expect(source.errorMessage).toBe('cloud rejected request');
  });

  it('非失败任务不能重新执行', async () => {
    const queryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 18,
        userId: 9,
        status: 'unknown',
      }),
    };
    const service = new ComfyTasksService(
      { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.retry(18, 9, 'retry-request')).rejects.toThrow(
      '只有失败的任务可以重新执行',
    );
  });
});
