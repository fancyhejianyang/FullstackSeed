import { getMetadataArgsStorage } from 'typeorm';
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
  };
  const config = {
    id: 5,
    name: '创作',
    providerId: 6,
    providerName: '账号',
    model: 'text-model',
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
      answer: ' 新正文 ',
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
  const service = new ContentGenerationService(
    tasks as never,
    articles as never,
    configs as never,
    providers as never,
    templates as never,
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
    dto,
    task,
  };
}

describe('持久化文章生成任务', () => {
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
    h.tasks.findOne.mockResolvedValue(h.task);
    await expect(h.service.submit(3, h.dto, 7)).resolves.toMatchObject({
      id: 20,
    });
    await expect(h.service.submit(4, h.dto, 7)).rejects.toThrow('请求号');
    expect(h.configs.findUsableContentCreationConfig).not.toHaveBeenCalled();
    expect(h.tasks.save).not.toHaveBeenCalled();
  });
  it('同请求号不能悄悄替换配置、模板或文章版本', async () => {
    const h = setup();
    h.tasks.findOne.mockResolvedValue(h.task);
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
    h.tasks.findOne.mockResolvedValue(h.task);
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
        totalTokens: 100,
        activeUserId: null,
        activeArticleId: null,
      }),
    );
    expect(h.articles.save).not.toHaveBeenCalled();
    expect(h.article.content).toBe('原文');
  });
  it('抢占失败不调用；过期运行任务只标记中断，不重新计费', async () => {
    const h = setup();
    h.tasks.findOne.mockResolvedValue(h.task);
    h.tasks.update
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
      h.tasks.findOne.mockResolvedValue(h.task);
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
    h.tasks.findOne.mockResolvedValue(h.task);
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
    h.tasks.findOne.mockResolvedValue(h.task);
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
    expect(options.where).toEqual({ articleId: 3, userId: 7 });
    h.articles.findOne.mockResolvedValue(null);
    h.tasks.findOne.mockResolvedValue(h.task);
    await expect(h.service.detail(20, 7)).rejects.toThrow('内容不存在');
  });
  it('采用必须为本人已成功任务且两个版本一致，二次采用拒绝', async () => {
    const h = setup();
    h.task.status = 'succeeded';
    h.task.result = '候选正文';
    h.tasks.findOne.mockResolvedValue(h.task);
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
