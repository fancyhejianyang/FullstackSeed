import { Repository, EntityManager, Not, Like } from 'typeorm';
import { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import { ContentArticlesService } from '../content-articles/content-articles.service';
import { ContentArticle } from '../content-articles/entities/content-article.entity';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import { User } from '../users/entities/user.entity';
import {
  HotTopic,
  HotTopicPreference,
  HotTopicRun,
} from './entities/hot-topic.entity';
import { HotTopicFetchService } from './hot-topic-fetch.service';
import { HotTopicSourcesService } from './hot-topic-sources.service';
import { HotTopicsService } from './hot-topics.service';
import type { HotPreferenceInput } from './hot-topic.types';

const preference = (): HotPreferenceInput => ({
  mode: 'platform',
  aiConfigId: null,
  sourceIds: [1],
  interests: '',
  exclusions: '',
  audience: '',
  writingStyle: '',
  lookbackHours: 24,
  maxResults: 10,
  scheduleEnabled: false,
  scheduleTime: '08:30',
});
function setup() {
  const topics = {
    findOne: jest.fn(),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    manager: { transaction: jest.fn() },
  };
  const preferences = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
  };
  const runs = {
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    create: jest.fn((value: unknown) => value),
    save: jest.fn().mockResolvedValue({ id: 7 }),
  };
  const users = { findOne: jest.fn() };
  const ai = {};
  const sources = {
    selected: jest
      .fn()
      .mockResolvedValue([{ id: 1, isEnabled: true, accessMode: 'page' }]),
  };
  const configs = { findUsableTopicDiscoveryConfig: jest.fn() };
  const providers = { resolveWebSearchTarget: jest.fn().mockResolvedValue({}) };
  const collector = {};
  const articles = {
    create: jest.fn().mockResolvedValue({ id: 99 }),
    createAndQueueGeneration: jest.fn(),
  };
  const service = new HotTopicsService(
    topics as unknown as Repository<HotTopic>,
    preferences as unknown as Repository<HotTopicPreference>,
    runs as unknown as Repository<HotTopicRun>,
    users as unknown as Repository<User>,
    ai as Repository<AiFeatureConfig>,
    sources as unknown as HotTopicSourcesService,
    configs as unknown as AiFeatureConfigsService,
    providers as unknown as KnowledgeAiProvidersService,
    collector as HotTopicFetchService,
    articles as unknown as ContentArticlesService,
  );
  return {
    service,
    topics,
    preferences,
    runs,
    users,
    sources,
    configs,
    providers,
    articles,
  };
}

describe('热点选题核心', () => {
  it('任务详情和分页只返回诊断入口标记，正文仅通过独立接口读取', async () => {
    const { service, runs } = setup();
    const response = { responseBody: '{"output":[]}', version: 1 };
    const firstSource = {
      sourceId: 1,
      sourceName: '抖音热点',
      status: 'failed',
      count: 0,
      message: '未确认联网',
      searchDiagnostics: response,
    };
    const row = {
      id: 18,
      userId: 9,
      sources: [
        firstSource,
        {
          ...firstSource,
          searchDiagnostics: undefined,
          searchResponseSourceIndex: 0,
        },
      ],
    };
    runs.findOne.mockResolvedValue(row);
    runs.findAndCount.mockResolvedValue([[row], 1]);
    const detail = await service.findRun(18, 9);
    const page = await service.findRuns({}, 9);
    for (const result of [detail, page.list[0]]) {
      expect(result.sources?.map((source) => source.hasSearchResponse)).toEqual(
        [true, true],
      );
      expect(JSON.stringify(result)).not.toContain('responseBody');
      expect(JSON.stringify(result)).not.toContain('searchResponseSourceIndex');
    }
    expect(row.sources[0].searchDiagnostics).toBe(response);
    await expect(service.findRunSearchResponse(18, 1, 9)).resolves.toBe(
      response,
    );
    expect(runs.findOne).toHaveBeenLastCalledWith({
      select: { id: true, userId: true, sources: true },
      where: { id: 18, userId: 9 },
    });
  });
  it('响应查看仅查询本人任务；历史缺失和不存在的来源不能补造数据', async () => {
    const { service, runs } = setup();
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    try {
      await expect(service.findRunSearchResponse(18, 0, 10)).rejects.toThrow(
        '任务不存在',
      );
      expect(runs.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 18, userId: 10 } }),
      );
      runs.findOne.mockResolvedValue({ id: 18, userId: 9, sources: null });
      await expect(service.findRunSearchResponse(18, 0, 9)).rejects.toThrow(
        '历史任务无法补回',
      );
      await expect(service.findRunSearchResponse(18, 99, 9)).rejects.toThrow(
        '未保存联网响应',
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
  it('响应来源下标须为有效非负整数，检查失败不查询数据库', async () => {
    const { service, runs } = setup();
    for (const index of [-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])
      await expect(service.findRunSearchResponse(18, index, 9)).rejects.toThrow(
        '来源编号无效',
      );
    expect(runs.findOne).not.toHaveBeenCalled();
  });
  it('默认在数据库分页前排除当前用户已忽略的选题', async () => {
    const { service, topics } = setup();
    await service.findAll({ page: 2, pageSize: 10 }, 8);
    expect(topics.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 8, decision: Not('ignored') },
        skip: 10,
        take: 10,
      }),
    );
  });
  it('关键词和推荐程度查询仍默认排除已忽略', async () => {
    const { service, topics } = setup();
    await service.findAll({ keyword: '新闻', level: 'high' }, 8);
    expect(topics.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: [
          {
            userId: 8,
            decision: Not('ignored'),
            recommendationLevel: 'high',
            title: Like('%新闻%'),
          },
          {
            userId: 8,
            decision: Not('ignored'),
            recommendationLevel: 'high',
            summary: Like('%新闻%'),
          },
        ],
      }),
    );
  });
  it.each(['new', 'ignored', 'selected'] as const)(
    '显式查询 %s 保留当前用户隔离',
    async (decision) => {
      const { service, topics } = setup();
      await service.findAll({ decision }, 8);
      expect(topics.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 8, decision } }),
      );
    },
  );
  it('显式全部包含已忽略但不移除用户范围', async () => {
    const { service, topics } = setup();
    await service.findAll({ decision: 'all' }, 8);
    expect(topics.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 8 } }),
    );
  });
  it('默认不启用定时，也不隐式选择收费 AI', async () => {
    const { service, preferences } = setup();
    const result = await service.getPreferences(8);
    expect(result).toMatchObject({
      userId: 8,
      aiConfigId: null,
      mode: 'aiSearch',
      sourceIds: [],
      scheduleEnabled: false,
      nextRunAt: null,
      timeZone: 'Asia/Shanghai',
    });
    expect(preferences.save).toHaveBeenCalledTimes(1);
  });
  it('关闭每日计划不依赖原 AI 仍然可用，开启计划需当前执行权限', async () => {
    const { service, preferences, configs, users } = setup();
    preferences.findOne.mockResolvedValue({
      ...preference(),
      id: 1,
      userId: 9,
    });
    configs.findUsableTopicDiscoveryConfig.mockRejectedValue(
      new Error('AI 已删除'),
    );
    const form = { ...preference(), aiConfigId: 404, scheduleEnabled: false };
    await expect(service.savePreferences(form, 9)).resolves.toMatchObject({
      aiConfigId: 404,
      scheduleEnabled: false,
      nextRunAt: null,
    });
    expect(configs.findUsableTopicDiscoveryConfig).not.toHaveBeenCalled();
    users.findOne.mockResolvedValue({
      isAdmin: false,
      roles: [
        {
          isActive: true,
          permissionCodes: ['HotTopic.update', 'HotTopic.read'],
        },
      ],
    });
    await expect(
      service.savePreferences({ ...form, scheduleEnabled: true }, 9),
    ).rejects.toThrow('执行权限');
  });
  it('详情和列表强制用户隔离', async () => {
    const { service, topics } = setup();
    await expect(service.findOne(1, 9)).rejects.toThrow('不存在');
    expect(topics.findOne).toHaveBeenCalledWith({
      where: { id: 1, userId: 9 },
    });
    await service.findAll({}, 9);
    expect(topics.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 9, decision: Not('ignored') },
        select: {
          id: true,
          title: true,
          sourceName: true,
          rank: true,
          recommendationLevel: true,
          reason: true,
          decision: true,
          fetchedAt: true,
          articleId: true,
        },
      }),
    );
  });
  it('重复请求只返回原任务，不重复登记或调用模型', async () => {
    const { service, runs, sources } = setup();
    runs.findOne.mockResolvedValue({ id: 7, action: 'discover' });
    await service.submit({ requestId: 'same', action: 'discover' }, 9);
    expect(runs.save).not.toHaveBeenCalled();
    expect(sources.selected).not.toHaveBeenCalled();
    await expect(
      service.submit({ requestId: 'same', action: 'recommend' }, 9),
    ).rejects.toThrow('其它操作');
  });
  it('任务提交前拒绝已停用来源，避免悄悄扩大搜索范围', async () => {
    const { service, preferences, sources, runs } = setup();
    preferences.findOne.mockResolvedValue(preference());
    sources.selected.mockResolvedValue([]);
    await expect(
      service.submit({ requestId: 'first', action: 'discover' }, 9),
    ).rejects.toThrow('停用或删除');
    expect(runs.save).not.toHaveBeenCalled();
  });
  it('AI 搜索在提交前拒绝无法核验来源的 Chat 协议', async () => {
    const { service, preferences, configs, runs } = setup();
    preferences.findOne.mockResolvedValue({
      ...preference(),
      mode: 'aiSearch',
      aiConfigId: 1,
    });
    configs.findUsableTopicDiscoveryConfig.mockResolvedValue({
      id: 1,
      webSearchMode: 'bailianChat',
    });
    await expect(
      service.submit({ requestId: 'first', action: 'discover' }, 9),
    ).rejects.toThrow('原生联网搜索');
    expect(runs.save).not.toHaveBeenCalled();
  });
  it.each(['platform', 'hybrid', 'aiSearch'] as const)(
    '仅选择抖音与网易时 %s 模式和每日计划无需联网配置',
    async (mode) => {
      const { service, sources, configs, providers, preferences, users } =
        setup();
      sources.selected.mockResolvedValue([
        { id: 1, kind: 'douyinHot', accessMode: 'search', isEnabled: true },
        { id: 2, kind: 'neteaseNews', accessMode: 'search', isEnabled: true },
      ]);
      preferences.findOne.mockResolvedValue({
        ...preference(),
        id: 1,
        userId: 9,
      });
      users.findOne.mockResolvedValue({ isAdmin: true, roles: [] });
      const saved = await service.savePreferences(
        {
          ...preference(),
          mode,
          sourceIds: [1, 2],
          scheduleEnabled: true,
        },
        9,
      );
      expect(saved).toMatchObject({
        mode,
        sourceIds: [1, 2],
        aiConfigId: null,
        scheduleEnabled: true,
      });
      expect(saved.nextRunAt).toBeInstanceOf(Date);
      expect(configs.findUsableTopicDiscoveryConfig).not.toHaveBeenCalled();
      expect(providers.resolveWebSearchTarget).not.toHaveBeenCalled();
    },
  );
  it('未选来源的 AI 模式采用默认抖音固定来源，不要求联网配置', async () => {
    const { service, preferences, sources, configs, providers, runs } = setup();
    preferences.findOne.mockResolvedValue({
      ...preference(),
      mode: 'aiSearch',
      sourceIds: [],
    });
    sources.selected.mockResolvedValue([]);
    runs.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 7, userId: 9, status: 'pending' });
    await expect(
      service.submit(
        {
          requestId: 'default-douyin',
          action: 'discover',
        },
        9,
      ),
    ).resolves.toMatchObject({ id: 7 });
    expect(configs.findUsableTopicDiscoveryConfig).not.toHaveBeenCalled();
    expect(providers.resolveWebSearchTarget).not.toHaveBeenCalled();
  });
  it.each(['platform', 'hybrid'] as const)(
    '%s 模式仍要求至少选择一个启用来源',
    async (mode) => {
      const { service, preferences, sources, runs } = setup();
      preferences.findOne.mockResolvedValue({
        ...preference(),
        mode,
        sourceIds: [],
      });
      sources.selected.mockResolvedValue([]);
      await expect(
        service.submit(
          {
            requestId: `no-source-${mode}`,
            action: 'discover',
          },
          9,
        ),
      ).rejects.toThrow('至少选择一个');
      expect(runs.save).not.toHaveBeenCalled();
    },
  );
  it('固定来源在 AI 模式可搭配普通推荐配置，不解析联网卡片', async () => {
    const { service, sources, configs, providers } = setup();
    const config = { id: 1, webSearchMode: 'disabled' };
    configs.findUsableTopicDiscoveryConfig.mockResolvedValue(config);
    sources.selected.mockResolvedValue([
      { id: 1, kind: 'douyinHot', accessMode: 'search', isEnabled: true },
    ]);
    const internal = service as unknown as {
      validateExecution(
        pref: HotPreferenceInput,
        action: 'discover',
      ): Promise<unknown>;
    };
    await expect(
      internal.validateExecution(
        {
          ...preference(),
          mode: 'aiSearch',
          aiConfigId: 1,
        },
        'discover',
      ),
    ).resolves.toBe(config);
    expect(providers.resolveWebSearchTarget).not.toHaveBeenCalled();
  });
  it('AI 模式混入微博来源仍要求启用联网配置', async () => {
    const { service, sources, preferences, runs } = setup();
    sources.selected.mockResolvedValue([
      { id: 1, kind: 'douyinHot', accessMode: 'search', isEnabled: true },
      { id: 2, kind: 'weiboHot', accessMode: 'page', isEnabled: true },
    ]);
    preferences.findOne.mockResolvedValue({
      ...preference(),
      mode: 'aiSearch',
      sourceIds: [1, 2],
    });
    await expect(
      service.submit(
        {
          requestId: 'mixed-search',
          action: 'discover',
        },
        9,
      ),
    ).rejects.toThrow('原生联网搜索');
    expect(runs.save).not.toHaveBeenCalled();
  });
  it.each(['disabled', 'bailianChat'] as const)(
    '混合模式有直读来源时保留平台采集与普通推荐：%s',
    async (webSearchMode) => {
      const { service, sources, configs } = setup();
      const config = { id: 1, webSearchMode };
      configs.findUsableTopicDiscoveryConfig.mockResolvedValue(config);
      sources.selected.mockResolvedValue([
        { id: 1, kind: 'weiboHot', accessMode: 'page', isEnabled: true },
      ]);
      const internal = service as unknown as {
        validateExecution(
          pref: HotPreferenceInput,
          action: 'discover',
        ): Promise<unknown>;
      };
      await expect(
        internal.validateExecution(
          { ...preference(), mode: 'hybrid', aiConfigId: 1 },
          'discover',
        ),
      ).resolves.toBe(config);
    },
  );
  it('混合模式仅有搜索来源时仍拒绝未开启的联网配置', async () => {
    const { service, preferences, configs, sources, runs } = setup();
    preferences.findOne.mockResolvedValue({
      ...preference(),
      mode: 'hybrid',
      aiConfigId: 1,
    });
    configs.findUsableTopicDiscoveryConfig.mockResolvedValue({
      id: 1,
      webSearchMode: 'disabled',
    });
    sources.selected.mockResolvedValue([
      { id: 1, kind: 'weiboHot', accessMode: 'search', isEnabled: true },
    ]);
    await expect(
      service.submit({ requestId: 'search-only', action: 'discover' }, 9),
    ).rejects.toThrow('原生联网搜索');
    expect(runs.save).not.toHaveBeenCalled();
  });
  it('纯 AI 模式支持腾讯搜索，并在提交前使用共用模型卡片解析', async () => {
    const { service, preferences, configs, providers, runs } = setup();
    preferences.findOne.mockResolvedValue({
      ...preference(),
      mode: 'aiSearch',
      aiConfigId: 1,
    });
    const config = {
      id: 1,
      providerId: 2,
      model: 'hy3',
      webSearchMode: 'tokenhubSearch',
    };
    configs.findUsableTopicDiscoveryConfig.mockResolvedValue(config);
    runs.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 7, userId: 9, status: 'pending' });
    await expect(
      service.submit({ requestId: 'tencent-search', action: 'discover' }, 9),
    ).resolves.toMatchObject({ id: 7 });
    expect(providers.resolveWebSearchTarget).toHaveBeenCalledWith({
      id: 2,
      model: 'hy3',
      webSearchMode: 'tokenhubSearch',
    });
    providers.resolveWebSearchTarget.mockRejectedValueOnce(
      new Error('当前模型缺少联网搜索卡片'),
    );
    runs.findOne.mockResolvedValue(null);
    await expect(
      service.submit({ requestId: 'missing-card', action: 'discover' }, 9),
    ).rejects.toThrow('缺少联网搜索卡片');
    expect(runs.save).toHaveBeenCalledTimes(1);
  });

  it('文章生成权限单独校验，不因拥有热点权限放行', async () => {
    const { service, topics } = setup();
    const user = {
      userId: 9,
      username: 'tester',
      isAdmin: false,
      roles: [],
      permissions: ['HotTopic.create', 'ContentArticle.create'],
    };
    await expect(
      service.createArticle(
        1,
        { requestId: 'first', idea: '我的想法', generate: true, aiConfigId: 1 },
        user,
      ),
    ).rejects.toThrow('权限');
    expect(topics.manager.transaction).not.toHaveBeenCalled();
  });
  it('失效租约和已取消任务不得保存迟到结果', async () => {
    const { service } = setup();
    const manager = {
      getRepository: jest
        .fn()
        .mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) }),
    } as unknown as EntityManager;
    const run = { id: 7, startedAt: new Date() } as HotTopicRun;
    const internal = service as unknown as {
      assertLease(
        manager: EntityManager,
        run: HotTopicRun,
        signal: AbortSignal,
      ): Promise<void>;
    };
    await expect(
      internal.assertLease(manager, run, new AbortController().signal),
    ).rejects.toThrow('执行权已失效');
    const abort = new AbortController();
    abort.abort(new Error('已超时'));
    await expect(
      internal.assertLease(manager, run, abort.signal),
    ).rejects.toThrow('已超时');
  });
  it('当前权限重新检查以 permissionCodes 为准，禁用账号和撤权立即拒绝', async () => {
    const { service, users } = setup();
    const internal = service as unknown as {
      assertUser(userId: number): Promise<void>;
    };
    users.findOne.mockResolvedValue({
      isAdmin: false,
      roles: [
        {
          isActive: true,
          permissionCodes: [],
          permissions: [{ code: 'HotTopic.read' }, { code: 'HotTopic.create' }],
        },
      ],
    });
    await expect(internal.assertUser(9)).rejects.toThrow('权限已撤销');
    users.findOne.mockResolvedValue(null);
    await expect(internal.assertUser(9)).rejects.toThrow('账号已停用');
    users.findOne.mockResolvedValue({
      isAdmin: false,
      roles: [
        {
          isActive: true,
          permissionCodes: ['HotTopic.read', 'HotTopic.create'],
        },
      ],
    });
    await expect(internal.assertUser(9)).resolves.toBeUndefined();
  });
  it('选题采用锁行防重复创建，来源快照和文章在同一事务保存', async () => {
    const { service, topics, articles } = setup();
    const topic = {
      id: 1,
      userId: 9,
      title: '热点标题',
      articleId: null as number | null,
      candidates: [
        {
          title: '新闻',
          url: 'https://www.douyin.com/video/1',
          sourceName: '抖音',
          summary: '参考摘要',
          publishedAt: null,
          fetchedAt: '2026-10-21T00:00:00Z',
          acquisition: 'page',
          accountName: null,
          accountMatched: false,
        },
      ],
    };
    const topicRepo = {
      findOne: jest.fn().mockResolvedValue(topic),
      update: jest
        .fn()
        .mockImplementation((_id: number, fields: Partial<HotTopic>) => {
          Object.assign(topic, fields);
          return Promise.resolve({ affected: 1 });
        }),
    };
    const articleRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 99, userId: 9 }),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === ContentArticle ? articleRepo : topicRepo,
      ),
    } as unknown as EntityManager;
    topics.manager.transaction.mockImplementation(
      (callback: (manager: EntityManager) => Promise<unknown>) =>
        callback(manager),
    );
    const user = {
      userId: 9,
      username: 'tester',
      isAdmin: true,
      roles: [],
      permissions: [],
    };
    const request = {
      requestId: 'first',
      idea: '独立的个人想法',
      generate: false,
    };
    await expect(service.createArticle(1, request, user)).resolves.toEqual({
      id: 99,
    });
    await expect(service.createArticle(1, request, user)).resolves.toEqual({
      id: 99,
    });
    expect(articles.create).toHaveBeenCalledTimes(1);
    expect(articles.create).toHaveBeenCalledWith(
      expect.objectContaining({ idea: '独立的个人想法' }),
      9,
      true,
      manager,
      {
        topicId: 1,
        materials: [
          expect.objectContaining({
            contentExcerpt: '参考摘要',
            url: 'https://www.douyin.com/video/1',
          }),
        ],
      },
    );
    expect(topicRepo.findOne).toHaveBeenCalledWith({
      where: { id: 1, userId: 9 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(articles.createAndQueueGeneration).not.toHaveBeenCalled();
  });
  it('停机恢复只补一次当前任务，下一次直接排到未来而不是回放历史', async () => {
    const { service, preferences } = setup();
    const locked = {
      ...preference(),
      id: 1,
      userId: 9,
      scheduleEnabled: true,
      nextRunAt: new Date('2020-01-01T00:30:00Z'),
    };
    const prefRepo = {
      findOne: jest.fn().mockResolvedValue(locked),
      update: jest.fn().mockImplementation((_id: number, fields: object) => {
        Object.assign(locked, fields);
        return Promise.resolve({ affected: 1 });
      }),
    };
    const runRepo = {
      exists: jest.fn().mockResolvedValue(false),
      create: jest.fn((value: unknown) => value),
      save: jest.fn().mockResolvedValue({ id: 7 }),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === HotTopicPreference ? prefRepo : runRepo,
      ),
    } as unknown as EntityManager;
    Object.assign(preferences, {
      find: jest.fn().mockResolvedValue([locked]),
      manager: {
        transaction: (callback: (manager: EntityManager) => Promise<unknown>) =>
          callback(manager),
      },
    });
    const internal = service as unknown as { scheduleDue(): Promise<void> };
    await internal.scheduleDue();
    await internal.scheduleDue();
    expect(runRepo.save).toHaveBeenCalledTimes(1);
    expect(locked.nextRunAt.getTime()).toBeGreaterThan(Date.now());
    expect(runRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'schedule:1:2020-01-01T00:30:00.000Z',
        trigger: 'schedule',
        activeUserId: 9,
      }),
    );
  });
});
