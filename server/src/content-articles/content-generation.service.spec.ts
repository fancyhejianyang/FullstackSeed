import { getMetadataArgsStorage } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { HEADERS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_KEY } from '../common/decorators/require-permissions.decorator';
import {
  AdoptContentTaskDto,
  QueryContentTaskDto,
} from './dto/content-article.dto';
import { ContentGenerationService } from './content-generation.service';
import { ContentArticle } from './entities/content-article.entity';
import { ContentGenerationTask } from './entities/content-generation-task.entity';
import { ContentArticlesController } from './content-articles.controller';
import { AddContentGenerationTasks1792371600000 } from '../migrations/1792371600000-AddContentGenerationTasks';

function setup() {
  const article = {
    id: 3,
    userId: 7,
    version: 2,
    title: '标题',
    idea: '想法',
    content: '原文',
    aiConfigId: 5 as number | null,
    templateId: 8 as number | null,
  };
  const config = {
    id: 5,
    name: '创作',
    providerId: 6,
    providerName: '账号',
    model: 'text-model',
    responseFormat: 'text',
    temperature: 0.4,
    enableThinking: true,
    thinkingParameters: { enable_thinking: true },
    systemPrompt: '保留作者口吻',
  };
  const tasks = {
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: object) => Promise.resolve({ id: 20, ...value })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    manager: { transaction: jest.fn() },
  };
  const articles = {
    findOne: jest.fn().mockResolvedValue(article),
    save: jest.fn((value: object) => Promise.resolve(value)),
    update: jest.fn(),
  };
  const manager = {
    getRepository: (entity: unknown) =>
      entity === ContentArticle ? articles : tasks,
  };
  tasks.manager.transaction.mockImplementation(
    (callback: (manager: unknown) => Promise<unknown>) => callback(manager),
  );
  const configs = {
    findUsableContentCreationConfig: jest.fn().mockResolvedValue(config),
    contentCreationOptions: jest.fn().mockResolvedValue({ list: [], total: 0 }),
  };
  const providers = {
    resolveChatTarget: jest
      .fn()
      .mockResolvedValue({ apiKey: 'never-save-secret' }),
    withExecutionSignal: jest.fn(
      (_signal: AbortSignal, run: () => Promise<unknown>) => run(),
    ),
    callChat: jest.fn().mockResolvedValue({
      isSuccess: true,
      answer: JSON.stringify({
        outcome: 'draft',
        title: '新拟的发布标题',
        body: ' 新正文 ',
        notes: ['发布前确认来源日期'],
      }),
      usage: { totalTokens: 100 },
    }),
  };
  const templates = {
    findOne: jest.fn().mockResolvedValue({
      id: 8,
      name: '公众号',
      instruction: '先叙事再总结',
    }),
  };
  const covers = {
    generate: jest
      .fn()
      .mockResolvedValue({ status: 'skipped', data: { message: '未配置' } }),
  };
  const service = new ContentGenerationService(
    tasks as never,
    articles as never,
    configs as never,
    providers as never,
    templates as never,
    covers as never,
  );
  const dto = {
    version: 2,
    requestId: '890a892d-b369-405e-a8f1-7cb2c830a5a9',
    templateId: 8,
    aiConfigId: 5,
  };
  const task = {
    id: 20,
    articleId: 3,
    articleVersion: 2,
    userId: 7,
    requestId: dto.requestId,
    status: 'pending',
    snapshot: {
      title: article.title,
      idea: article.idea,
      template: { id: 8, name: '公众号', instruction: '先叙事再总结' },
      config: { ...config, thinkingParameters: config.thinkingParameters },
    },
    result: null,
  } as unknown as ContentGenerationTask;
  return {
    service,
    tasks,
    articles,
    article,
    configs,
    config,
    providers,
    templates,
    covers,
    dto,
    task,
  };
}

describe('持久化文章生成任务', () => {
  it('热点参考资料独立写入生成快照，原始想法不被来源替换', async () => {
    const h = setup();
    const materials = [
      {
        title: '热点来源',
        url: 'https://example.com/news',
        sourceName: '公开来源',
        publishedAt: null,
        fetchedAt: '2026-10-21T00:00:00.000Z',
        contentExcerpt: '摘要',
        acquisition: 'aiSearch' as const,
      },
    ];
    Object.assign(h.article, { sourceTopicId: 2, sourceMaterials: materials });
    await h.service.submit(3, h.dto, 7);
    expect(h.tasks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          idea: '想法',
          sourceMaterials: materials,
        }) as unknown,
      }),
    );
  });
  it('列表最新任务仅投影封面 URL 标量，保持本人/文章范围且不加载大 JSON', async () => {
    const h = setup();
    const builder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getQuery: jest.fn().mockReturnValue('latest-task-ids'),
      getParameters: jest.fn().mockReturnValue({ userId: 7, articleIds: [3] }),
      setParameters: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawMany: jest
        .fn()
        .mockResolvedValue([
          { id: 20, articleId: 3, generatedCoverUrl: '/uploads/cover.png' },
        ]),
    };
    const createQueryBuilder = jest.fn().mockReturnValue(builder);
    Object.assign(h.tasks, { createQueryBuilder });
    await expect(h.service.latest([], 7)).resolves.toEqual([]);
    expect(createQueryBuilder).not.toHaveBeenCalled();
    await expect(h.service.latest([3], 7)).resolves.toEqual([
      { id: 20, articleId: 3, generatedCoverUrl: '/uploads/cover.png' },
    ]);
    expect(builder.where).toHaveBeenCalledWith('recent.userId = :userId', {
      userId: 7,
    });
    expect(builder.andWhere).toHaveBeenCalledWith(
      'recent.articleId IN (:...articleIds)',
      { articleIds: [3] },
    );
    expect(builder.select).toHaveBeenCalledWith('MAX(recent.id)');
    expect(builder.groupBy).toHaveBeenCalledWith('recent.articleId');
    expect(builder.setParameters).toHaveBeenCalledWith({
      userId: 7,
      articleIds: [3],
    });
    const selections = builder.addSelect.mock.calls as unknown as Array<
      [string, string]
    >;
    for (const field of [
      'task.result',
      'task.coverData',
      'task.snapshot',
      'task.editorNotes',
    ])
      expect(selections.some(([sql]) => sql === field)).toBe(false);
    const coverSql = selections.find(
      ([, alias]) => alias === 'generatedCoverUrl',
    )![0];
    expect(coverSql).toContain("task.status = 'succeeded'");
    expect(coverSql).toContain("task.coverStatus = 'succeeded'");
    expect(coverSql).toContain(
      "JSON_TYPE(JSON_EXTRACT(task.coverData, '$.url')) = 'STRING'",
    );
    expect(coverSql).toContain(
      "JSON_UNQUOTE(JSON_EXTRACT(task.coverData, '$.url')) ELSE NULL END",
    );
    expect(h.tasks.update).not.toHaveBeenCalled();
    expect(h.providers.callChat).not.toHaveBeenCalled();
  });
  it('新任务启用封面而历史任务不补计费，正文完成先落库并保留活跃锁', async () => {
    const h = setup();
    await h.service.submit(3, h.dto, 7);
    expect(h.tasks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({ coverRequested: true }) as unknown,
      }),
    );
    h.task.snapshot.coverRequested = true;
    h.tasks.findOne.mockImplementation(
      ({ where }: { where: { coverStatus?: string } }) =>
        Promise.resolve(where.coverStatus ? null : h.task),
    );
    await h.service.tick();
    expect(h.tasks.update).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'succeeded',
        result: '新正文',
        coverStatus: 'pending',
        activeArticleId: 3,
        activeUserId: 7,
        finishedAt: null,
      }),
    );
    expect(h.covers.generate).not.toHaveBeenCalled();
    expect(h.articles.save).not.toHaveBeenCalled();
  });
  it.each(['succeeded', 'failed', 'skipped', 'interrupted'])(
    '封面 %s 只更新封面并释放锁，不清除正文',
    async (status) => {
      const h = setup();
      h.task.status = 'succeeded';
      h.task.coverStatus = 'pending';
      h.task.result = '已完成正文';
      h.tasks.findOne.mockResolvedValue(h.task);
      h.covers.generate.mockResolvedValue({
        status,
        data: { message: '结果' },
      });
      await h.service.tick();
      expect(h.providers.callChat).not.toHaveBeenCalled();
      expect(h.covers.generate).toHaveBeenCalledTimes(1);
      const write = h.tasks.update.mock.calls.at(-1) as unknown as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      expect(write[0]).toMatchObject({
        status: 'succeeded',
        coverStatus: 'running',
      });
      expect(write[1]).toMatchObject({
        coverStatus: status,
        activeArticleId: null,
        activeUserId: null,
      });
      expect(write[1]).not.toHaveProperty('result');
      expect(write[1]).not.toHaveProperty('status');
      expect(h.articles.save).not.toHaveBeenCalled();
    },
  );
  it('封面抢占失败不计费，过期封面中断保留正文，停服取消且不自动重试', async () => {
    const h = setup();
    h.task.status = 'succeeded';
    h.task.coverStatus = 'pending';
    h.tasks.findOne.mockResolvedValue(h.task);
    h.tasks.update
      .mockResolvedValueOnce({ affected: 0 })
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValueOnce({ affected: 0 });
    await h.service.tick();
    expect(h.covers.generate).not.toHaveBeenCalled();
    expect(h.tasks.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ coverStatus: 'running' }),
      expect.objectContaining({
        coverStatus: 'interrupted',
        activeUserId: null,
      }),
    );
    h.covers.generate.mockImplementation(() => {
      h.service.onModuleDestroy();
      return Promise.resolve({
        status: 'succeeded',
        data: { message: '迟到' },
      });
    });
    await h.service.tick();
    expect(h.tasks.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ leaseExpiresAt: expect.anything() as unknown }),
      expect.objectContaining({ coverStatus: 'interrupted' }),
    );
  });
  it('封面采纳显式勾选且校验版本、状态、归属；不勾选保留原封面', async () => {
    const h = setup();
    Object.assign(h.article, { coverUrl: '/uploads/original.png' });
    h.task.status = 'succeeded';
    h.task.result = '新正文';
    h.task.coverStatus = 'succeeded';
    h.task.coverData = { url: '/uploads/generated.png' };
    h.tasks.findOne.mockResolvedValue(h.task);
    await h.service.adopt(20, 2, 7);
    expect(h.articles.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ coverUrl: '/uploads/original.png' }),
    );
    await h.service.adopt(20, 2, 7, false, true);
    expect(h.articles.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        coverUrl: '/uploads/generated.png',
        content: '新正文',
      }),
    );
    await expect(h.service.adopt(20, 9, 7, false, true)).rejects.toThrow(
      '文章在提交',
    );
    h.task.coverStatus = 'failed';
    await expect(h.service.adopt(20, 2, 7, false, true)).rejects.toThrow(
      '没有可采用的封面',
    );
    await expect(
      h.service.adopt(20, 2, 7, false, false),
    ).resolves.toBeDefined();
    h.task.coverStatus = 'running';
    await expect(h.service.adopt(20, 2, 7)).rejects.toThrow('封面仍在生成');
    const errors = await validate(
      plainToInstance(AdoptContentTaskDto, { version: 2, adoptCover: 'true' }),
    );
    expect(errors.some((error) => error.property === 'adoptCover')).toBe(true);
  });
  it('独立记录列表按本人/未删除文章过滤，分页倒序且不查询大字段', async () => {
    const h = setup();
    const builder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(12),
      getRawMany: jest
        .fn()
        .mockResolvedValue([{ id: 20, articleTitle: '标题' }]),
    };
    Object.assign(h.tasks, {
      createQueryBuilder: jest.fn().mockReturnValue(builder),
    });
    expect(
      await h.service.listAll(
        {
          articleId: 3,
          status: 'succeeded',
          keyword: ' 标题 ',
          page: 2,
          pageSize: 10,
        },
        7,
      ),
    ).toEqual({ list: [{ id: 20, articleTitle: '标题' }], total: 12 });
    expect(builder.innerJoin).toHaveBeenCalledWith(
      ContentArticle,
      'article',
      expect.stringContaining(
        'article.userId = :userId AND article.deletedAt IS NULL',
      ),
      { userId: 7 },
    );
    expect(builder.where).toHaveBeenCalledWith('task.userId = :userId', {
      userId: 7,
    });
    expect(builder.andWhere).toHaveBeenCalledWith(
      'task.articleId = :articleId',
      { articleId: 3 },
    );
    expect(builder.andWhere).toHaveBeenCalledWith('task.status = :status', {
      status: 'succeeded',
    });
    expect(builder.andWhere).toHaveBeenCalledWith(
      'article.title LIKE :keyword',
      { keyword: '%标题%' },
    );
    expect(builder.orderBy).toHaveBeenCalledWith('task.id', 'DESC');
    expect(builder.offset).toHaveBeenCalledWith(10);
    expect(builder.limit).toHaveBeenCalledWith(10);
    expect(builder.select).toHaveBeenCalledWith([]);
    const fields = builder.addSelect.mock.calls.map(
      (call: string[]) => call[0],
    );
    for (const field of [
      'task.result',
      'task.snapshot',
      'task.editorNotes',
      'task.coverData',
      'article.content',
    ])
      expect(fields).not.toContain(field);
    expect(fields).toContain('article.title');
  });
  it.each([
    'pending',
    'running',
    'failed',
    'needs_input',
    'succeeded',
    'adopted',
  ] as const)(
    '实时预览保留最新任务 %s，不回退历史成功稿或写回正文',
    async (status) => {
      const h = setup();
      h.task.status = status;
      h.tasks.findOne
        .mockResolvedValueOnce({ id: 20 })
        .mockResolvedValueOnce(h.task);
      const preview = await h.service.preview(3, 7);
      expect(preview.article.content).toBe('原文');
      expect(preview.latestTask?.status).toBe(status);
      expect(h.tasks.findOne).toHaveBeenNthCalledWith(1, {
        select: { id: true },
        where: { articleId: 3, userId: 7 },
        order: { id: 'DESC' },
      });
      expect(h.tasks.findOne).toHaveBeenNthCalledWith(2, {
        where: { id: 20, userId: 7 },
      });
      expect(h.articles.save).not.toHaveBeenCalled();
      expect(h.providers.callChat).not.toHaveBeenCalled();
    },
  );
  it('预览无任务返回空；越权或已删除文章不读取任务', async () => {
    const h = setup();
    expect((await h.service.preview(3, 7)).latestTask).toBeNull();
    h.tasks.findOne.mockClear();
    h.articles.findOne.mockResolvedValue(null);
    await expect(h.service.preview(3, 8)).rejects.toThrow('内容不存在');
    expect(h.articles.findOne).toHaveBeenLastCalledWith({
      where: { id: 3, userId: 8 },
    });
    expect(h.tasks.findOne).not.toHaveBeenCalled();
  });
  it('独立查询校验分页/文章/状态，新接口沿用读取权限并禁止缓存', async () => {
    expect(
      await validate(
        plainToInstance(QueryContentTaskDto, {
          articleId: '3',
          page: '2',
          status: 'running',
        }),
      ),
    ).toHaveLength(0);
    for (const query of [
      { articleId: 0 },
      { articleId: 'invalid' },
      { status: 'bogus' },
      { pageSize: 101 },
    ]) {
      expect(
        (await validate(plainToInstance(QueryContentTaskDto, query))).length,
      ).toBeGreaterThan(0);
    }
    for (const name of ['allTasks', 'preview', 'task'] as const) {
      const handler = ContentArticlesController.prototype[name];
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
        'ContentArticle.read',
      ]);
      expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toContainEqual({
        name: 'Cache-Control',
        value: 'no-store',
      });
    }
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        // 只读取装饰器元数据，不脱离实例调用方法。
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ContentArticlesController.prototype.allTasks,
      ),
    ).toBe('tasks');
  });
  it('首次选择与任务在同一事务中保存，递增版本但不写正文', async () => {
    const h = setup();
    h.article.aiConfigId = null;
    h.article.templateId = null;
    const task = await h.service.submit(3, h.dto, 7);
    expect(task.articleVersion).toBe(3);
    expect(h.articles.update).toHaveBeenCalledWith(
      { id: 3, userId: 7, version: 2 },
      { aiConfigId: 5, templateId: 8, version: 3 },
    );
    expect(h.tasks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({ requestVersion: 2 }) as unknown,
      }),
    );
    expect(h.tasks.manager.transaction).toHaveBeenCalledTimes(1);
    expect(h.providers.callChat).not.toHaveBeenCalled();
    h.task.articleVersion = 3;
    h.task.snapshot.requestVersion = 2;
    h.tasks.findOne.mockImplementation(
      ({ where }: { where: { coverStatus?: string } }) =>
        Promise.resolve(
          where.coverStatus === 'pending' && h.task.coverStatus !== 'pending'
            ? null
            : h.task,
        ),
    );
    await expect(h.service.submit(3, h.dto, 7)).resolves.toMatchObject({
      id: 20,
      articleVersion: 3,
    });
    expect(h.tasks.save).toHaveBeenCalledTimes(1);
  });

  it('复用已保存设置不递增文章版本，不影响候选采用', async () => {
    const h = setup();
    await expect(h.service.submit(3, h.dto, 7)).resolves.toMatchObject({
      articleVersion: 2,
    });
    expect(h.articles.update).not.toHaveBeenCalled();
  });
  it('先落库快照返回任务 ID，不在请求中调用计费 API，也不保存秘密', async () => {
    const h = setup();
    await expect(h.service.submit(3, h.dto, 7)).resolves.toMatchObject({
      id: 20,
      status: 'pending',
      articleVersion: 2,
    });
    expect(h.templates.findOne).toHaveBeenCalledWith(8, 7);
    expect(h.configs.findUsableContentCreationConfig).toHaveBeenCalledWith(5);
    expect(h.tasks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        activeArticleId: 3,
        activeUserId: 7,
        snapshot: expect.objectContaining({
          title: '标题',
          idea: '想法',
          template: { id: 8, name: '公众号', instruction: '先叙事再总结' },
        }) as unknown,
      }),
    );
    expect(JSON.stringify(h.tasks.save.mock.calls)).not.toContain(
      'never-save-secret',
    );
    expect(h.providers.callChat).not.toHaveBeenCalled();
    expect(h.articles.save).not.toHaveBeenCalled();
  });
  it('重复请求返回原任务，跨文章复用请求号拒绝', async () => {
    const h = setup();
    h.tasks.findOne.mockImplementation(
      ({ where }: { where: { coverStatus?: string } }) =>
        Promise.resolve(
          where.coverStatus === 'pending' && h.task.coverStatus !== 'pending'
            ? null
            : h.task,
        ),
    );
    await expect(h.service.submit(3, h.dto, 7)).resolves.toMatchObject({
      id: 20,
    });
    await expect(h.service.submit(4, h.dto, 7)).rejects.toThrow('请求号');
    expect(h.configs.findUsableContentCreationConfig).not.toHaveBeenCalled();
    expect(h.tasks.save).not.toHaveBeenCalled();
  });
  it('同请求号不能悄悄替换配置、模板或文章版本', async () => {
    const h = setup();
    h.tasks.findOne.mockImplementation(
      ({ where }: { where: { coverStatus?: string } }) =>
        Promise.resolve(
          where.coverStatus === 'pending' && h.task.coverStatus !== 'pending'
            ? null
            : h.task,
        ),
    );
    for (const changes of [
      { aiConfigId: 9 },
      { templateId: 10 },
      { version: 3 },
    ]) {
      await expect(
        h.service.submit(3, { ...h.dto, ...changes }, 7),
      ).rejects.toThrow('不同生成参数');
    }
    expect(h.tasks.save).not.toHaveBeenCalled();
    expect(h.providers.callChat).not.toHaveBeenCalled();
  });
  it('安全选项入口仅委托专用概要方法；指定不同配置保存对应模型快照', async () => {
    const h = setup();
    const controller = new ContentArticlesController({} as never, h.service);
    await expect(
      controller.generationConfigs({ keyword: '写作', pageSize: 100 }),
    ).resolves.toEqual({ list: [], total: 0 });
    expect(h.configs.contentCreationOptions).toHaveBeenCalledWith({
      keyword: '写作',
      pageSize: 100,
    });
    h.configs.findUsableContentCreationConfig.mockResolvedValue({
      ...h.config,
      id: 9,
      model: 'selected-model',
    });
    await h.service.submit(3, { ...h.dto, aiConfigId: 9 }, 7);
    expect(h.configs.findUsableContentCreationConfig).toHaveBeenCalledWith(9);
    expect(h.providers.resolveChatTarget).toHaveBeenCalledWith({
      id: 6,
      model: 'selected-model',
    });
    expect(h.tasks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          config: expect.objectContaining({
            id: 9,
            model: 'selected-model',
          }) as unknown,
        }) as unknown,
      }),
    );
  });
  it('数据库唯一约束兜底并发提交，网络重试回查同一任务', async () => {
    const h = setup();
    h.tasks.save.mockRejectedValue({ code: 'ER_DUP_ENTRY' });
    await expect(h.service.submit(3, h.dto, 7)).rejects.toThrow('已有文章');
    h.tasks.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(h.task);
    await expect(h.service.submit(3, h.dto, 7)).resolves.toMatchObject({
      id: 20,
    });
  });
  it('本人隔离、版本检查、空想法和缺少配置均在入队前拒绝', async () => {
    const h = setup();
    h.articles.findOne.mockResolvedValueOnce(null);
    await expect(h.service.submit(3, h.dto, 8)).rejects.toThrow('内容不存在');
    expect(h.articles.findOne).toHaveBeenCalledWith({
      where: { id: 3, userId: 8 },
    });
    await expect(
      h.service.submit(3, { ...h.dto, version: 1 }, 7),
    ).rejects.toThrow('文章已更新');
    h.article.idea = ' ';
    await expect(h.service.submit(3, h.dto, 7)).rejects.toThrow('想法');
    h.article.idea = '素材';
    h.configs.findUsableContentCreationConfig.mockRejectedValue(
      new Error('请配置内容创作'),
    );
    await expect(h.service.submit(3, h.dto, 7)).rejects.toThrow('内容创作');
    expect(h.tasks.save).not.toHaveBeenCalled();
    expect(h.providers.callChat).not.toHaveBeenCalled();
  });
  it('锁内再次核对文章版本，避免校验与落库之间丢失更新', async () => {
    const h = setup();
    h.articles.findOne
      .mockResolvedValueOnce(h.article)
      .mockResolvedValueOnce({ ...h.article, version: 3 });
    await expect(h.service.submit(3, h.dto, 7)).rejects.toThrow('文章已更新');
    expect(h.tasks.save).not.toHaveBeenCalled();
  });
  it('模板归属检查失败不入队；默认模板不读取模板库', async () => {
    const h = setup();
    h.templates.findOne.mockRejectedValueOnce(new Error('写作模板不存在'));
    await expect(h.service.submit(3, h.dto, 7)).rejects.toThrow('模板不存在');
    expect(h.tasks.save).not.toHaveBeenCalled();
    await h.service.submit(
      3,
      { version: 2, requestId: h.dto.requestId, aiConfigId: 5 },
      7,
    );
    expect(h.templates.findOne).toHaveBeenCalledTimes(1);
  });
  it('从队列取出后按快照调用，仅保存候选结果，文章原文不变', async () => {
    const h = setup();
    h.tasks.findOne.mockImplementation(
      ({ where }: { where: { coverStatus?: string } }) =>
        Promise.resolve(
          where.coverStatus === 'pending' && h.task.coverStatus !== 'pending'
            ? null
            : h.task,
        ),
    );
    h.config.model = 'changed-after-submit';
    await h.service.tick();
    expect(h.providers.callChat).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 6,
        model: 'text-model',
        question: JSON.stringify({ title: '标题', idea: '想法' }),
        systemPrompt: expect.stringContaining('先叙事再总结') as unknown,
      }),
    );
    expect(h.tasks.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 20,
        status: 'running',
        workerId: expect.any(String) as unknown,
        leaseExpiresAt: expect.any(Object) as unknown,
      }),
      expect.objectContaining({
        status: 'succeeded',
        result: '新正文',
        generatedTitle: '新拟的发布标题',
        editorNotes: ['发布前确认来源日期'],
        totalTokens: 100,
        activeUserId: null,
        activeArticleId: null,
      }),
    );
    expect(h.articles.save).not.toHaveBeenCalled();
    expect(h.article.content).toBe('原文');
    expect(h.article.title).toBe('标题');
  });
  it('实际调用带当前时间和任务提交时间，使用取消新闻审核门槛后的成稿提示', async () => {
    const h = setup();
    h.task.createdAt = new Date('2026-10-18T16:30:00Z');
    h.tasks.findOne.mockImplementation(
      ({ where }: { where: { coverStatus?: string } }) =>
        Promise.resolve(
          where.coverStatus === 'pending' && h.task.coverStatus !== 'pending'
            ? null
            : h.task,
        ),
    );
    await h.service.tick();
    const prompt = (
      h.providers.callChat.mock.calls[0] as unknown as [
        { systemPrompt: string },
      ]
    )[0].systemPrompt;
    expect(prompt).toMatch(
      /当前服务器时间为 \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/,
    );
    expect(prompt).toContain('任务提交时间为 2026-10-19 00:30:00');
    expect(prompt).toContain('默认直接输出 draft 正文');
    expect(h.providers.callChat).toHaveBeenCalledTimes(1);
  });
  it('格式写入任务快照，后续配置修改不会影响已排队任务', async () => {
    const h = setup();
    await h.service.submit(3, h.dto, 7);
    expect(h.tasks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          config: expect.objectContaining({
            responseFormat: 'text',
          }) as unknown,
        }) as unknown,
      }),
    );
    h.config.responseFormat = 'markdown';
    h.tasks.findOne.mockImplementation(
      ({ where }: { where: { coverStatus?: string } }) =>
        Promise.resolve(
          where.coverStatus === 'pending' && h.task.coverStatus !== 'pending'
            ? null
            : h.task,
        ),
    );
    await h.service.tick();
    expect(h.providers.callChat).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining('body 使用纯文本') as unknown,
      }),
    );
  });
  it('模型仍返回待补充时保留真实状态，释放活跃锁，不伪装成功或重复调用', async () => {
    const h = setup();
    h.tasks.findOne.mockImplementation(
      ({ where }: { where: { coverStatus?: string } }) =>
        Promise.resolve(
          where.coverStatus === 'pending' && h.task.coverStatus !== 'pending'
            ? null
            : h.task,
        ),
    );
    h.providers.callChat.mockResolvedValue({
      isSuccess: true,
      answer: JSON.stringify({
        outcome: 'needs_input',
        body: '',
        notes: ['请澄清“审批旭日旗”的具体行为，并提供报道日期与原文'],
      }),
      usage: { totalTokens: 80 },
    });
    await h.service.tick();
    expect(h.tasks.update).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'needs_input',
        result: null,
        editorNotes: ['请澄清“审批旭日旗”的具体行为，并提供报道日期与原文'],
        activeUserId: null,
        activeArticleId: null,
        totalTokens: 80,
        errorMessage: null,
      }),
    );
    expect(h.providers.callChat).toHaveBeenCalledTimes(1);
    expect(h.articles.save).not.toHaveBeenCalled();
    h.task.status = 'needs_input';
    await expect(h.service.adopt(20, 2, 7)).rejects.toThrow('没有可采用');
  });
  it('无效结构失败而非伪装成稿，保留用量且不自动追加调用', async () => {
    const h = setup();
    h.tasks.findOne.mockImplementation(
      ({ where }: { where: { coverStatus?: string } }) =>
        Promise.resolve(
          where.coverStatus === 'pending' && h.task.coverStatus !== 'pending'
            ? null
            : h.task,
        ),
    );
    h.providers.callChat.mockResolvedValue({
      isSuccess: true,
      answer: '作者认为……待补充',
      usage: { totalTokens: 40 },
    });
    await h.service.tick();
    expect(h.tasks.update).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'failed',
        result: null,
        editorNotes: null,
        totalTokens: 40,
        errorMessage: expect.stringContaining(
          '有效的标题、正文与编辑提示结构',
        ) as unknown,
      }),
    );
    expect(h.providers.callChat).toHaveBeenCalledTimes(1);
  });
  it('旧成功任务继续读取与采用，详情提示与正文分开返回', async () => {
    const h = setup();
    h.task.status = 'succeeded';
    h.task.result = '历史正文';
    h.tasks.findOne.mockImplementation(
      ({ where }: { where: { coverStatus?: string } }) =>
        Promise.resolve(
          where.coverStatus === 'pending' && h.task.coverStatus !== 'pending'
            ? null
            : h.task,
        ),
    );
    await expect(h.service.detail(20, 7)).resolves.toMatchObject({
      result: '历史正文',
      editorNotes: null,
      generatedTitle: null,
    });
    h.task.editorNotes = ['发布前核对'];
    await expect(h.service.detail(20, 7)).resolves.toMatchObject({
      result: '历史正文',
      editorNotes: ['发布前核对'],
    });
    await h.service.adopt(20, 2, 7);
    expect(h.articles.save).toHaveBeenCalledWith(
      expect.objectContaining({ content: '历史正文' }),
    );
  });
  it('抢占失败不调用；过期运行任务只标记中断，不重新计费', async () => {
    const h = setup();
    h.tasks.findOne.mockImplementation(
      ({ where }: { where: { coverStatus?: string } }) =>
        Promise.resolve(
          where.coverStatus === 'pending' && h.task.coverStatus !== 'pending'
            ? null
            : h.task,
        ),
    );
    h.tasks.update
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValueOnce({ affected: 0 });
    await h.service.tick();
    expect(h.tasks.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: 'running' }),
      expect.objectContaining({ status: 'interrupted', activeUserId: null }),
    );
    expect(h.providers.callChat).not.toHaveBeenCalled();
    h.tasks.findOne.mockResolvedValue(null);
    await h.service.tick();
    expect(h.tasks.findOne).toHaveBeenLastCalledWith({
      where: { status: 'pending' },
      order: { id: 'ASC' },
    });
    expect(h.providers.callChat).not.toHaveBeenCalled();
  });
  it.each(['', '   ', 'x'.repeat(50001)])(
    '空白/超长输出失败，原文保持不变 (%#)',
    async (answer) => {
      const h = setup();
      h.tasks.findOne.mockImplementation(
        ({ where }: { where: { coverStatus?: string } }) =>
          Promise.resolve(
            where.coverStatus === 'pending' && h.task.coverStatus !== 'pending'
              ? null
              : h.task,
          ),
      );
      h.providers.callChat.mockResolvedValue({
        isSuccess: true,
        answer,
        usage: { totalTokens: 1 },
      });
      await h.service.tick();
      expect(h.tasks.update).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'failed', result: null }),
      );
      expect(h.article.content).toBe('原文');
    },
  );
  it('失败不泄漏供应商错误，不自动重试', async () => {
    const h = setup();
    h.tasks.findOne.mockImplementation(
      ({ where }: { where: { coverStatus?: string } }) =>
        Promise.resolve(
          where.coverStatus === 'pending' && h.task.coverStatus !== 'pending'
            ? null
            : h.task,
        ),
    );
    h.providers.callChat.mockRejectedValue(new Error('secret internal-url'));
    await h.service.tick();
    expect(h.providers.callChat).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.tasks.update.mock.calls)).not.toContain('secret');
    expect(h.tasks.update).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'failed', activeUserId: null }),
    );
  });
  it('服务停止发出取消信号，结果按中断记录，不覆盖文章', async () => {
    const h = setup();
    h.tasks.findOne.mockImplementation(
      ({ where }: { where: { coverStatus?: string } }) =>
        Promise.resolve(
          where.coverStatus === 'pending' && h.task.coverStatus !== 'pending'
            ? null
            : h.task,
        ),
    );
    h.providers.callChat.mockImplementation(() => {
      h.service.onModuleDestroy();
      return Promise.resolve({ isSuccess: true, answer: '完成' });
    });
    await h.service.tick();
    expect(h.providers.withExecutionSignal.mock.calls[0][0].aborted).toBe(true);
    expect(h.tasks.update).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'interrupted', result: null }),
    );
  });
  it('任务详情与列表先校验归属，列表不选择大字段', async () => {
    const h = setup();
    await expect(h.service.detail(20, 8)).rejects.toThrow('任务不存在');
    expect(h.tasks.findOne).toHaveBeenCalledWith({
      where: { id: 20, userId: 8 },
    });
    await h.service.list(3, {}, 7);
    const [options] = h.tasks.findAndCount.mock.calls[0] as unknown as [
      {
        select: object;
        where: object;
      },
    ];
    expect(options.select).not.toHaveProperty('snapshot');
    expect(options.select).not.toHaveProperty('result');
    expect(options.select).not.toHaveProperty('editorNotes');
    expect(options.where).toEqual({ articleId: 3, userId: 7 });
    h.articles.findOne.mockResolvedValue(null);
    h.tasks.findOne.mockImplementation(
      ({ where }: { where: { coverStatus?: string } }) =>
        Promise.resolve(
          where.coverStatus === 'pending' && h.task.coverStatus !== 'pending'
            ? null
            : h.task,
        ),
    );
    await expect(h.service.detail(20, 7)).rejects.toThrow('内容不存在');
  });
  it('采用必须为本人已成功任务且两个版本一致，二次采用拒绝', async () => {
    const h = setup();
    h.task.status = 'succeeded';
    h.task.result = '候选正文';
    h.tasks.findOne.mockImplementation(
      ({ where }: { where: { coverStatus?: string } }) =>
        Promise.resolve(
          where.coverStatus === 'pending' && h.task.coverStatus !== 'pending'
            ? null
            : h.task,
        ),
    );
    await expect(h.service.adopt(20, 1, 7)).rejects.toThrow(
      '文章在提交任务后已修改',
    );
    h.article.version = 3;
    await expect(h.service.adopt(20, 3, 7)).rejects.toThrow(
      '文章在提交任务后已修改',
    );
    expect(h.articles.save).not.toHaveBeenCalled();
    h.article.version = 2;
    await h.service.adopt(20, 2, 7);
    expect(h.articles.save).toHaveBeenCalledWith(
      expect.objectContaining({ content: '候选正文' }),
    );
    expect(h.tasks.update).toHaveBeenCalledWith(20, { status: 'adopted' });
    h.task.status = 'adopted';
    await expect(h.service.adopt(20, 2, 7)).rejects.toThrow('没有可采用');
  });
  it('选择采用标题时同事务更新标题和正文，未选择/旧客户端保持原标题', async () => {
    for (const adoptTitle of [true, false, undefined]) {
      const h = setup();
      h.task.status = 'succeeded';
      h.task.result = '候选正文';
      h.task.generatedTitle = '发布标题';
      h.tasks.findOne.mockImplementation(
        ({ where }: { where: { coverStatus?: string } }) =>
          Promise.resolve(
            where.coverStatus === 'pending' && h.task.coverStatus !== 'pending'
              ? null
              : h.task,
          ),
      );
      await h.service.adopt(20, 2, 7, adoptTitle);
      expect(h.articles.save).toHaveBeenCalledWith(
        expect.objectContaining({
          title: adoptTitle ? '发布标题' : '标题',
          content: '候选正文',
        }),
      );
      expect(h.tasks.manager.transaction).toHaveBeenCalledTimes(1);
      expect(h.task.generatedTitle).toBe('发布标题');
      expect(h.providers.callChat).not.toHaveBeenCalled();
    }
  });
  it('历史任务误选采用标题或版本冲突时不修改标题/正文', async () => {
    const h = setup();
    h.task.status = 'succeeded';
    h.task.result = '候选正文';
    h.tasks.findOne.mockImplementation(
      ({ where }: { where: { coverStatus?: string } }) =>
        Promise.resolve(
          where.coverStatus === 'pending' && h.task.coverStatus !== 'pending'
            ? null
            : h.task,
        ),
    );
    await expect(h.service.adopt(20, 2, 7, true)).rejects.toThrow(
      '没有生成标题',
    );
    h.task.generatedTitle = '发布标题';
    await expect(h.service.adopt(20, 3, 7, true)).rejects.toThrow(
      '文章在提交任务后已修改',
    );
    expect(h.articles.save).not.toHaveBeenCalled();
    expect(h.article).toMatchObject({ title: '标题', content: '原文' });
  });
  it('当前生成链路必须返回标题，失败无额外计费重试；详情才加载生成标题', async () => {
    const h = setup();
    h.tasks.findOne.mockImplementation(
      ({ where }: { where: { coverStatus?: string } }) =>
        Promise.resolve(
          where.coverStatus === 'pending' && h.task.coverStatus !== 'pending'
            ? null
            : h.task,
        ),
    );
    h.providers.callChat.mockResolvedValue({
      isSuccess: true,
      answer: JSON.stringify({
        outcome: 'draft',
        body: '无标题正文',
        notes: [],
      }),
      usage: { totalTokens: 30 },
    });
    await h.service.tick();
    expect(h.tasks.update).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'failed',
        result: null,
        generatedTitle: null,
        totalTokens: 30,
      }),
    );
    expect(h.providers.callChat).toHaveBeenCalledTimes(1);
    expect(h.articles.save).not.toHaveBeenCalled();
    h.task.generatedTitle = '发布标题';
    expect((await h.service.detail(20, 7)).generatedTitle).toBe('发布标题');
    await h.service.list(3, {}, 7);
    const [options] = h.tasks.findAndCount.mock.calls[0] as [
      { select: Record<string, boolean> },
    ];
    expect(options.select).not.toHaveProperty('generatedTitle');
  });
  it('采用标题开关只接受布尔，缺省兼容旧调用，控制器透传且不信任客户端标题', async () => {
    for (const adoptTitle of ['true', 'false', 1, {}]) {
      expect(
        (
          await validate(
            plainToInstance(AdoptContentTaskDto, { version: 2, adoptTitle }),
          )
        ).length,
      ).toBeGreaterThan(0);
    }
    for (const adoptTitle of [true, false, undefined]) {
      expect(
        await validate(
          plainToInstance(AdoptContentTaskDto, { version: 2, adoptTitle }),
        ),
      ).toHaveLength(0);
    }
    const generation = { adopt: jest.fn() };
    const controller = new ContentArticlesController(
      {} as never,
      generation as never,
    );
    await controller.adopt(20, { version: 2, adoptTitle: true }, 7);
    expect(generation.adopt).toHaveBeenCalledWith(20, 2, 7, true, false);
    await controller.adopt(20, { version: 2 }, 7);
    expect(generation.adopt).toHaveBeenLastCalledWith(20, 2, 7, false, false);
  });
  it('生成时选择模板需独立读取权限', () => {
    const h = setup();
    const controller = new ContentArticlesController({} as never, h.service);
    expect(() =>
      controller.regenerate(3, h.dto, {
        userId: 7,
        isAdmin: false,
        permissions: [],
      } as never),
    ).toThrow('无权使用写作模板');
  });
  it('任务实体含请求去重、用户和文章并发唯一约束', () => {
    const indexes = getMetadataArgsStorage().indices.filter(
      (index) => index.target === ContentGenerationTask,
    );
    expect(
      indexes.filter((index) => index.unique).map((index) => index.name),
    ).toEqual(
      expect.arrayContaining([
        'UQ_content_task_request',
        'UQ_content_task_active_article',
        'UQ_content_task_active_user',
      ]),
    );
  });
  it('增量迁移幂等，不覆盖已有表和配置列', async () => {
    const runner = {
      hasTable: jest.fn().mockResolvedValue(false),
      createTable: jest.fn(),
      hasColumn: jest.fn().mockResolvedValue(false),
      addColumn: jest.fn(),
      getTable: jest.fn().mockResolvedValue({ indices: [] }),
      createIndex: jest.fn(),
    };
    const migration = new AddContentGenerationTasks1792371600000();
    await migration.up(runner as never);
    expect(runner.createTable).toHaveBeenCalledTimes(2);
    expect(runner.addColumn).toHaveBeenCalledTimes(1);
    expect(runner.createIndex).toHaveBeenCalledTimes(1);
    runner.hasTable.mockResolvedValue(true);
    runner.hasColumn.mockResolvedValue(true);
    runner.getTable.mockResolvedValue({
      indices: [{ name: 'UQ_ai_feature_active_content' }],
    });
    await migration.up(runner as never);
    expect(runner.createTable).toHaveBeenCalledTimes(2);
    expect(runner.addColumn).toHaveBeenCalledTimes(1);
    expect(runner.createIndex).toHaveBeenCalledTimes(1);
  });
});
