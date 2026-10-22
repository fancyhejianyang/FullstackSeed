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

  it('失败任务重新执行时原子重置原任务并清理旧输出关联', async () => {
    const task = {
      id: 18,
      userId: 9,
      connectionId: 2,
      status: 'failed',
      errorMessage: 'cloud rejected request',
    } as ComfyTask;
    const taskUpdate = jest.fn().mockResolvedValue({ affected: 1 });
    const outputSoftDelete = jest.fn().mockResolvedValue({ affected: 1 });
    const manager = {
      getRepository: jest
        .fn()
        .mockReturnValueOnce({ update: taskUpdate })
        .mockReturnValueOnce({ softDelete: outputSoftDelete }),
    };
    const taskRepository = {
      findOne: jest.fn().mockResolvedValue(task),
      manager: {
        transaction: jest.fn(
          (callback: (value: typeof manager) => Promise<unknown>) =>
            callback(manager),
        ),
      },
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
    jest.spyOn(service, 'findOne').mockResolvedValue({
      ...task,
      status: 'pending',
      stage: '等待重新执行',
    } as ComfyTask);
    jest
      .spyOn(service as unknown as { tick: () => Promise<void> }, 'tick')
      .mockResolvedValue();

    const result = await service.retry(18, 9);

    expect(taskUpdate).toHaveBeenCalledWith(
      { id: 18, userId: 9, status: 'failed' },
      {
        status: 'pending',
        stage: '等待重新执行',
        progress: null,
        promptId: null,
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
      },
    );
    expect(outputSoftDelete).toHaveBeenCalledWith({ taskId: 18 });
    expect(result.id).toBe(18);
  });

  it('非失败任务不能重新执行', async () => {
    const service = new ComfyTasksService(
      {
        findOne: jest.fn().mockResolvedValue({
          id: 18,
          userId: 9,
          status: 'unknown',
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.retry(18, 9)).rejects.toThrow(
      '只有失败的任务可以重新执行',
    );
  });
});
