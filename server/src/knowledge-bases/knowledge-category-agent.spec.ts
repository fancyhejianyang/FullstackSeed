import type { EntityManager } from 'typeorm';
import { KnowledgeBasesService } from './knowledge-bases.service';
import { KnowledgeBaseCategory } from './entities/knowledge-base-category.entity';

describe('Knowledge category Agent service integration', () => {
  const repository = () => ({
    findOne: jest.fn().mockResolvedValue({ id: 7 }),
    create: jest.fn((value: Partial<KnowledgeBaseCategory>) => value),
    save: jest.fn((value: Partial<KnowledgeBaseCategory>) =>
      Promise.resolve({
        id: 8,
        ...value,
      }),
    ),
  });

  it('checks parent and saves through the confirmation transaction, not the default repository', async () => {
    const defaultRepo = repository();
    const transactionRepo = repository();
    const manager = {
      getRepository: jest.fn().mockReturnValue(transactionRepo),
    };
    const service = Object.create(
      KnowledgeBasesService.prototype,
    ) as KnowledgeBasesService;
    Reflect.set(service, 'categoryRepository', defaultRepo);
    const result = await service.createCategory(
      { name: ' 子分类 ', parentId: 7 },
      manager as unknown as EntityManager,
    );
    expect(result).toMatchObject({ id: 8, name: '子分类', parentId: 7 });
    expect(manager.getRepository).toHaveBeenCalledWith(KnowledgeBaseCategory);
    expect(transactionRepo.findOne).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(defaultRepo.save).not.toHaveBeenCalled();
    transactionRepo.findOne.mockResolvedValueOnce(null);
    await expect(
      service.createCategory(
        { name: '子分类', parentId: 999 },
        manager as unknown as EntityManager,
      ),
    ).rejects.toThrow('上级分类');
    expect(transactionRepo.save).toHaveBeenCalledTimes(1);
  });

  it('preserves existing form creation without a transaction and supports top-level categories', async () => {
    const repo = repository();
    const service = Object.create(
      KnowledgeBasesService.prototype,
    ) as KnowledgeBasesService;
    Reflect.set(service, 'categoryRepository', repo);
    expect(await service.createCategory({ name: '售后' })).toMatchObject({
      parentId: null,
      name: '售后',
      code: '',
    });
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it('paginates filtered categories without changing the existing full list contract', async () => {
    const qb = {
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[{ id: 8 }], 3]),
      getMany: jest.fn().mockResolvedValue([{ id: 7 }]),
    };
    const service = Object.create(
      KnowledgeBasesService.prototype,
    ) as KnowledgeBasesService;
    Reflect.set(service, 'categoryRepository', {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    });
    expect(
      await service.findCategoriesPage({
        keyword: '售',
        parentId: 7,
        page: 2,
        pageSize: 2,
      }),
    ).toEqual({ list: [{ id: 8 }], total: 3 });
    expect(qb.skip).toHaveBeenCalledWith(2);
    expect(qb.take).toHaveBeenCalledWith(2);
    expect(qb.andWhere).toHaveBeenCalledWith(expect.any(String), {
      parentId: 7,
    });
    expect(await service.findCategories({})).toEqual([{ id: 7 }]);
  });
});
