import { AiMaterial } from './entities/ai-material.entity';
import { MaterialGenerationTask } from './entities/material-generation-task.entity';
import { AiMaterialsService } from './ai-materials.service';

function material(id = 1): AiMaterial {
  return {
    id,
    userId: 7,
    prompt: `素材 ${id}`,
    styleKey: 'original',
    customStyle: null,
    aiConfigId: 3,
    generationMode: 'textToImage',
    mediaType: 'image',
    currentMediaType: null,
    videoResolution: '720P',
    videoRatio: 'adaptive',
    videoDuration: 5,
    referenceFileId: null,
    referenceImageUrl: null,
    referenceMedia: null,
    currentFileId: null,
    currentImageUrl: null,
    version: 1,
    generationRevision: 0,
    generationStatus: 'idle',
    generationError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

describe('AI 素材生成队列', () => {
  it('提交时进入 pending 且不提前占用用户执行锁', async () => {
    const row = material();
    const transactionalMaterials = {
      findOne: jest.fn().mockResolvedValue({ ...row }),
      save: jest.fn((value: AiMaterial) => Promise.resolve(value)),
    };
    const transactionalTasks = {
      create: jest.fn((value: Partial<MaterialGenerationTask>) => value),
      save: jest.fn((value: Partial<MaterialGenerationTask>) =>
        Promise.resolve({
          ...value,
          id: 11,
          createdAt: new Date(),
        } as MaterialGenerationTask),
      ),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === AiMaterial ? transactionalMaterials : transactionalTasks,
      ),
    };
    const tasks = {
      findOne: jest.fn().mockResolvedValue(null),
      manager: {
        transaction: jest.fn(
          (callback: (value: typeof manager) => Promise<unknown>) =>
            callback(manager),
        ),
      },
    };
    const service = new AiMaterialsService(
      { findOne: jest.fn().mockResolvedValue(row) } as never,
      tasks as never,
      {} as never,
      {
        findUsableImageGenerationConfig: jest.fn().mockResolvedValue({
          id: 3,
          name: '生图配置',
          providerId: 5,
          providerName: '供应商',
          model: 'image-model',
          systemPrompt: null,
        }),
      } as never,
      {
        resolveMediaTarget: jest.fn().mockResolvedValue({
          protocol: 'openai',
        }),
      } as never,
      {} as never,
    );

    const result = await service.submit(
      row.id,
      { version: row.version, requestId: 'queue-request-1' },
      row.userId,
    );

    expect(result.status).toBe('pending');
    expect(transactionalTasks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending',
        activeMaterialId: row.id,
        activeUserId: null,
      }),
    );
  });

  it('领取最早可执行任务时才占用用户执行锁', async () => {
    const task = {
      id: 21,
      userId: 7,
      materialId: 2,
      status: 'pending',
      snapshot: { mediaType: 'image' },
    } as MaterialGenerationTask;
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(task),
    };
    const tasks = {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const materials = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const service = new AiMaterialsService(
      materials as never,
      tasks as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const runner = service as unknown as {
      run(taskId: number): Promise<void>;
    };
    const run = jest.spyOn(runner, 'run').mockResolvedValue(undefined);

    await service.tick();

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('active_task.activeUserId = task.userId'),
      { executionStatuses: ['running', 'storing'] },
    );
    expect(tasks.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: task.id, status: 'pending' }),
      expect.objectContaining({
        status: 'running',
        activeUserId: task.userId,
      }),
    );
    expect(run).toHaveBeenCalledWith(task.id);
  });
});
