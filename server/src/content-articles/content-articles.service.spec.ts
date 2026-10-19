import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { In, IsNull, Like } from 'typeorm';
import { PERMISSIONS_KEY } from '../common/decorators/require-permissions.decorator';
import { ContentArticlesController } from './content-articles.controller';
import { ContentArticlesService } from './content-articles.service';
import {
  BatchDeleteContentArticleDto,
  CreateContentArticleDto,
  GenerateContentTaskDto,
  QueryContentArticleDto,
  UpdateContentArticleDto,
} from './dto/content-article.dto';
import { CreateContentArticles1792368000000 } from '../migrations/1792368000000-CreateContentArticles';

function setup() {
  const article = {
    id: 3,
    userId: 7,
    title: '标题',
    idea: '我的想法',
    content: '原文',
    coverUrl: '',
    version: 2,
  };
  const repository = {
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    findOne: jest.fn().mockResolvedValue(article),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn().mockResolvedValue(2),
    softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const generation = { latest: jest.fn().mockResolvedValue([]) };
  const service = new ContentArticlesService(
    repository as never,
    generation as never,
  );
  return { service, repository, generation, article };
}

describe('内容创作 CRUD 与 AI 生成', () => {
  it('列表仅查询本人概要，不读取大段想法和正文', async () => {
    const h = setup();
    await expect(
      h.service.findAll({ keyword: ' 标题 ', page: 2, pageSize: 20 }, 7),
    ).resolves.toEqual({ list: [], total: 0 });
    expect(h.repository.findAndCount).toHaveBeenCalledWith({
      select: {
        id: true,
        title: true,
        coverUrl: true,
        createdAt: true,
        updatedAt: true,
        version: true,
      },
      where: { userId: 7, title: Like('%标题%') },
      order: { id: 'DESC' },
      skip: 20,
      take: 20,
    });
  });

  it('创建只保存四个业务字段与服务端用户，不接受注入归属或版本', async () => {
    const h = setup();
    const result = await h.service.create(
      {
        title: ' 新想法 ',
        userId: 99,
        version: 100,
      } as CreateContentArticleDto,
      7,
    );
    expect(result).toEqual({
      title: '新想法',
      coverUrl: '',
      idea: '',
      content: '',
      userId: 7,
    });
  });

  it('详情及所有按 ID 操作拒绝别人的记录，生成也不调用模型', async () => {
    const h = setup();
    h.repository.findOne.mockResolvedValue(null);
    await expect(h.service.findOne(3, 8)).rejects.toThrow('内容不存在');
    await expect(
      h.service.update(3, { title: 'x', version: 2 }, 8),
    ).rejects.toThrow('内容不存在');
    await expect(h.service.remove(3, 8)).rejects.toThrow('内容不存在');
    expect(h.repository.findOne).toHaveBeenCalledWith({
      where: { id: 3, userId: 8 },
    });
    expect(h.repository.update).not.toHaveBeenCalled();
    expect(h.repository.softDelete).not.toHaveBeenCalled();
  });

  it('保存使用原子版本条件，冲突不覆盖已有文章', async () => {
    const h = setup();
    await h.service.update(
      3,
      {
        title: '新标题',
        idea: '新想法',
        content: '新正文',
        coverUrl: '',
        version: 2,
      },
      7,
    );
    expect(h.repository.update).toHaveBeenCalledWith(
      { id: 3, userId: 7, version: 2, deletedAt: IsNull() },
      {
        title: '新标题',
        idea: '新想法',
        content: '新正文',
        coverUrl: '',
        version: 3,
      },
    );
    h.repository.update.mockResolvedValue({ affected: 0 });
    await expect(
      h.service.update(3, { title: '旧版本', version: 1 }, 7),
    ).rejects.toThrow('内容已被更新或删除');
  });

  it('软删除及批量删除均带用户条件，混入不可访问 ID 时不删除', async () => {
    const h = setup();
    await h.service.remove(3, 7);
    expect(h.repository.softDelete).toHaveBeenCalledWith({ id: 3, userId: 7 });
    await expect(h.service.batchRemove([3, 4, 3], 7)).resolves.toEqual({
      ids: [3, 4],
    });
    expect(h.repository.softDelete).toHaveBeenLastCalledWith({
      id: In([3, 4]),
      userId: 7,
    });
    h.repository.softDelete.mockClear();
    h.repository.count.mockResolvedValue(1);
    await expect(h.service.batchRemove([3, 99], 7)).rejects.toThrow(
      '部分内容不存在',
    );
    expect(h.repository.softDelete).not.toHaveBeenCalled();
  });

  it('只改标题时不清空未提交的想法、正文和封面', async () => {
    const h = setup();
    await h.service.update(3, { title: '改标题', version: 2 }, 7);
    expect(h.repository.update).toHaveBeenCalledWith(
      { id: 3, userId: 7, version: 2, deletedAt: IsNull() },
      { title: '改标题', version: 3 },
    );
  });

  it('列表关联最新任务概要，不把正文和快照带到列表', async () => {
    const h = setup();
    h.repository.findAndCount.mockResolvedValue([
      [{ id: 3, title: '标题' }],
      1,
    ]);
    h.generation.latest.mockResolvedValue([
      { id: 20, articleId: 3, status: 'running' },
    ]);
    const result = await h.service.findAll({}, 7);
    expect(h.generation.latest).toHaveBeenCalledWith([3], 7);
    expect(result.list[0]).toMatchObject({
      latestTask: { id: 20, status: 'running' },
    });
  });

  it('每个接口有独立权限，读取权限不能用于生成', () => {
    for (const [method, action] of Object.entries({
      findAll: 'read',
      findOne: 'read',
      create: 'create',
      update: 'update',
      remove: 'delete',
      batchRemove: 'batchDelete',
      tasks: 'read',
      task: 'read',
      adopt: 'update',
      regenerate: 'update',
      generationConfigs: 'update',
    })) {
      const handler =
        ContentArticlesController.prototype[
          method as keyof ContentArticlesController
        ];
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
        `ContentArticle.${action}`,
      ]);
    }
  });

  it('DTO 拒绝空标题、非法 URL、超长正文、空想法生成和无版本编辑', async () => {
    for (const value of [
      { title: ' ' },
      { title: 'a', coverUrl: 'javascript:alert(1)' },
      { title: 'a', content: 'x'.repeat(50001) },
      { title: 'a', idea: 'x'.repeat(20001) },
    ]) {
      expect(
        (await validate(plainToInstance(CreateContentArticleDto, value)))
          .length,
      ).toBeGreaterThan(0);
    }
    expect(
      (
        await validate(
          plainToInstance(GenerateContentTaskDto, { title: 'a', idea: ' ' }),
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (await validate(plainToInstance(UpdateContentArticleDto, { title: 'a' })))
        .length,
    ).toBeGreaterThan(0);
    expect(
      (
        await validate(
          plainToInstance(QueryContentArticleDto, { pageSize: 101 }),
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await validate(
          plainToInstance(BatchDeleteContentArticleDto, { ids: [] }),
        )
      ).length,
    ).toBeGreaterThan(0);
    await expect(
      validate(plainToInstance(CreateContentArticleDto, { title: '先记标题' })),
    ).resolves.toHaveLength(0);
  });

  it('生成必须显式选择正整数配置 ID', async () => {
    const base = {
      version: 1,
      requestId: '890a892d-b369-405e-a8f1-7cb2c830a5a9',
    };
    for (const aiConfigId of [undefined, null, 0, -1, 1.5, '2']) {
      expect(
        await validate(
          plainToInstance(GenerateContentTaskDto, { ...base, aiConfigId }),
        ),
      ).not.toHaveLength(0);
    }
    expect(
      await validate(
        plainToInstance(GenerateContentTaskDto, { ...base, aiConfigId: 2 }),
      ),
    ).toHaveLength(0);
  });

  it('迁移可重复执行且不覆盖已存在的表', async () => {
    const runner = {
      hasTable: jest.fn().mockResolvedValue(false),
      createTable: jest.fn().mockResolvedValue(undefined),
    };
    const migration = new CreateContentArticles1792368000000();
    await migration.up(runner as never);
    const table = runner.createTable.mock.calls[0] as unknown as [
      { columns: Array<{ name: string }>; name: string },
    ];
    expect(table[0].name).toBe('content_articles');
    expect(table[0].columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        'title',
        'coverUrl',
        'idea',
        'content',
        'userId',
        'version',
      ]),
    );
    runner.hasTable.mockResolvedValue(true);
    await migration.up(runner as never);
    expect(runner.createTable).toHaveBeenCalledTimes(1);
  });
});
