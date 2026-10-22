import type { FindManyOptions, FindOptionsWhere, Repository } from 'typeorm';
import { ComfyFilesService } from './comfy-files.service';
import {
  buildComfyMaterialListItem,
  ComfyMaterialsService,
} from './comfy-materials.service';
import { ComfyMaterial } from './entities/comfy-material.entity';

function material(
  id: number,
  values: Partial<ComfyMaterial> = {},
): ComfyMaterial {
  return {
    id,
    userId: 7,
    name: `task_6_${id}.png`,
    sourceType: 'output',
    mediaType: 'image',
    fileId: id + 100,
    fileUrl: `/uploads/${id}.png`,
    mimeType: 'image/png',
    size: 1024,
    sourceTaskId: 6,
    isFavorite: false,
    createdAt: new Date(`2026-10-22T00:00:0${id}.000Z`),
    updatedAt: new Date(`2026-10-22T00:00:0${id}.000Z`),
    deletedAt: null,
    ...values,
  } as ComfyMaterial;
}

function queryBuilder() {
  const builder = {
    where: jest.fn(),
    andWhere: jest.fn(),
    clone: jest.fn(),
    select: jest.fn(),
    addSelect: jest.fn(),
    groupBy: jest.fn(),
    orderBy: jest.fn(),
    offset: jest.fn(),
    limit: jest.fn(),
    getRawMany: jest.fn(),
    getRawOne: jest.fn(),
    getMany: jest.fn(),
  };
  for (const key of [
    'where',
    'andWhere',
    'select',
    'addSelect',
    'groupBy',
    'orderBy',
    'offset',
    'limit',
  ] as const) {
    builder[key].mockReturnValue(builder);
  }
  return builder;
}

describe('ComfyMaterialsService', () => {
  it('将同一任务的多个输出构造成一条素材组', () => {
    const result = buildComfyMaterialListItem('task:6', [
      material(1, { isFavorite: true }),
      material(3, { size: 2048, isFavorite: true }),
      material(2, { isFavorite: true }),
    ]);

    expect(result.id).toBe('task:6');
    expect(result.name).toBe('任务 #6 生成结果');
    expect(result.materialIds).toEqual([3, 2, 1]);
    expect(result.itemCount).toBe(3);
    expect(result.size).toBe(4096);
    expect(result.isFavorite).toBe(true);
  });

  it('上传素材保持独立行，混合收藏状态不伪装为整组已收藏', () => {
    const input = material(9, {
      name: '参考图.png',
      sourceType: 'input',
      sourceTaskId: null,
      isFavorite: true,
    });
    const single = buildComfyMaterialListItem('material:9', [input]);
    const mixed = buildComfyMaterialListItem('task:6', [
      material(1, { isFavorite: true }),
      material(2, { isFavorite: false }),
    ]);

    expect(single.name).toBe('参考图.png');
    expect(single.itemCount).toBe(1);
    expect(mixed.isFavorite).toBe(false);
  });

  it('按素材组分页并返回组数量，而不是按文件数量分页', async () => {
    const base = queryBuilder();
    const grouped = queryBuilder();
    const counted = queryBuilder();
    const details = queryBuilder();
    base.clone.mockReturnValueOnce(grouped).mockReturnValueOnce(counted);
    grouped.getRawMany.mockResolvedValue([
      { groupKey: 'task:6', latestId: '3' },
      { groupKey: 'material:9', latestId: '9' },
    ]);
    counted.getRawOne.mockResolvedValue({ total: '2' });
    details.getMany.mockResolvedValue([
      material(3),
      material(2),
      material(1),
      material(9, {
        name: '参考图.png',
        sourceType: 'input',
        sourceTaskId: null,
      }),
    ]);
    const repository = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(base)
        .mockReturnValueOnce(details),
    };
    const service = new ComfyMaterialsService(
      repository as unknown as Repository<ComfyMaterial>,
      {} as ComfyFilesService,
    );

    const result = await service.findAll(7, { page: 1, pageSize: 10 });

    expect(result.total).toBe(2);
    expect(result.list).toHaveLength(2);
    expect(result.list[0]).toEqual(
      expect.objectContaining({ id: 'task:6', itemCount: 3 }),
    );
    expect(grouped.groupBy).toHaveBeenCalledWith(
      expect.stringContaining('material.sourceTaskId'),
    );
    expect(grouped.offset).toHaveBeenCalledWith(0);
    expect(grouped.limit).toHaveBeenCalledWith(10);
  });

  it('整组收藏前校验全部素材归属', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([material(1)]),
      save: jest.fn(),
    };
    const service = new ComfyMaterialsService(
      repository as unknown as Repository<ComfyMaterial>,
      {} as ComfyFilesService,
    );

    await expect(service.updateGroupFavorite([1, 2], 7, true)).rejects.toThrow(
      '部分 ComfyUI 素材不存在',
    );
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('创作素材选项同时返回图片和视频，不限制为手工上传来源', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const service = new ComfyMaterialsService(
      { find } as unknown as Repository<ComfyMaterial>,
      {} as ComfyFilesService,
    );

    await service.options(7);

    expect(find).toHaveBeenCalledTimes(1);
    const [options] = find.mock.calls[0] as unknown as [
      FindManyOptions<ComfyMaterial>,
    ];
    const where = options.where as FindOptionsWhere<ComfyMaterial>;
    expect(where.userId).toBe(7);
    expect(where.sourceType).toBeUndefined();
    expect(where.mediaType).toMatchObject({
      _type: 'in',
      _value: ['image', 'video'],
    });
    expect(options.select).toEqual(
      expect.arrayContaining(['sourceType', 'mediaType']),
    );
  });

  it('任务参考媒体强制使用本地受管存储', async () => {
    const repository = {
      create: jest.fn((value: Partial<ComfyMaterial>) => ({
        ...value,
        id: 21,
      })),
      save: jest.fn((value: ComfyMaterial) => Promise.resolve(value)),
      softDelete: jest.fn(),
    };
    const files = {
      store: jest.fn().mockResolvedValue({
        id: 42,
        publicUrl: '/uploads/comfyui/development/objects/7/21/1/input.mp4',
      }),
    };
    const service = new ComfyMaterialsService(
      repository as unknown as Repository<ComfyMaterial>,
      files as unknown as ComfyFilesService,
    );
    const file = {
      buffer: Buffer.from('video'),
      originalname: 'pose.mp4',
      mimetype: 'video/mp4',
      size: 5,
    };

    const result = await service.uploadTaskInput(7, file, '动作参考视频');

    expect(files.store).toHaveBeenCalledWith(file, {
      ownerId: 7,
      materialId: 21,
      storagePolicy: 'local',
    });
    expect(result.fileUrl).toBe(
      '/uploads/comfyui/development/objects/7/21/1/input.mp4',
    );
  });
});
