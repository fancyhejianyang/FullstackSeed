import { HotTopicSource } from './entities/hot-topic.entity';
import { Repository } from 'typeorm';
import {
  HotTopicSourcesService,
  sourceView,
  validateSource,
} from './hot-topic-sources.service';
import { DOUYIN_HOT_URL, NETEASE_NEWS_URL } from './hot-topic.types';
import { HotTopicCookieService } from './hot-topic-cookie.service';

const source = () =>
  ({
    id: 1,
    name: '网易国内新闻',
    kind: 'neteaseNews',
    accessMode: 'page',
    url: NETEASE_NEWS_URL,
    accountName: '',
    accountId: '',
    isEnabled: false,
    description: '',
  }) as HotTopicSource;

describe('热点来源配置', () => {
  it('阻止本地、明文、凭据 URL', () => {
    for (const url of [
      'http://news.163.com',
      'https://127.0.0.1',
      'https://user:password@example.com',
      'https://news.163.com?token=abc',
    ])
      expect(() => validateSource({ ...source(), url })).toThrow();
  });
  it('微博页面来源仍允许平台自有页与第三方聚合页', () => {
    for (const url of [
      'https://s.weibo.com/top/summary',
      'https://tophub.today/n/KqndgxeLl9',
    ])
      expect(() =>
        validateSource({
          ...source(),
          kind: 'weiboHot',
          accessMode: 'page',
          url,
        }),
      ).not.toThrow();
    expect(() =>
      validateSource({
        ...source(),
        kind: 'weiboHot',
        accessMode: 'search',
        url: 'https://tophub.today/n/KqndgxeLl9',
      }),
    ).not.toThrow();
  });
  it('抖音热搜仅接受固定接口，忽略旧获取方式', () => {
    const douyin = {
      ...source(),
      kind: 'douyinHot' as const,
      url: DOUYIN_HOT_URL,
    };
    expect(() => validateSource(douyin)).not.toThrow();
    expect(() =>
      validateSource({ ...douyin, url: 'https://www.douyin.com/hot' }),
    ).toThrow('固定热搜接口地址');
    expect(() =>
      validateSource({ ...douyin, accessMode: 'search' }),
    ).not.toThrow();
  });
  it.each([
    ['douyinHot', DOUYIN_HOT_URL],
    ['neteaseNews', NETEASE_NEWS_URL],
  ] as const)('旧 %s 来源只读回显固定值，不改变原记录或启停', (kind, url) => {
    const row = {
      ...source(),
      kind,
      accessMode: 'search' as const,
      url: 'https://legacy.example.com/?token=private',
      apiToken: 'private',
    } as HotTopicSource;
    expect(sourceView(row)).toMatchObject({
      kind,
      url,
      isEnabled: false,
    });
    expect(sourceView(row)).not.toHaveProperty('apiToken');
    expect(sourceView(row)).not.toHaveProperty('accessMode');
    expect(row.url).toContain('private');
    expect(row.accessMode).toBe('search');
  });
  it.each([
    ['douyinHot', DOUYIN_HOT_URL],
    ['neteaseNews', NETEASE_NEWS_URL],
  ] as const)('创建和编辑 %s 都保存固定接口与 page 方式', async (kind, url) => {
    const original = { ...source(), kind, isEnabled: true };
    const repository = {
      create: jest.fn((row: unknown) => row),
      save: jest.fn((row: unknown) => Promise.resolve(row)),
      findOne: jest.fn().mockResolvedValue(original),
    };
    const service = new HotTopicSourcesService(
      repository as unknown as Repository<HotTopicSource>,
      {} as HotTopicCookieService,
    );
    const dto = {
      name: '固定来源',
      kind,
      accessMode: 'search' as const,
      url: 'https://legacy.example.com/not-used',
      isEnabled: true,
    };
    await expect(service.create(dto)).resolves.toMatchObject({
      url,
      isEnabled: true,
    });
    await expect(service.update(1, dto)).resolves.toMatchObject({
      url,
      isEnabled: true,
    });
    expect(repository.save).toHaveBeenCalledTimes(2);
    for (const [row] of repository.save.mock.calls)
      expect(row).toMatchObject({ url, accessMode: 'page', isEnabled: true });
  });
  it('网易国内新闻仅接受系统固定接口，不依赖历史获取方式', () => {
    expect(() =>
      validateSource({ ...source(), url: 'https://news.163.com/domestic/' }),
    ).toThrow('固定新闻接口地址');
    expect(() =>
      validateSource({ ...source(), accessMode: 'search' }),
    ).not.toThrow();
  });
  it('拒绝新增历史账号类型并以停用的普通页面兼容旧记录', () => {
    const account = {
      ...source(),
      kind: 'douyinAccount' as const,
      accessMode: 'page' as const,
      url: 'https://www.douyin.com/user/MS4w-test',
      accountName: '央视新闻',
      accountId: 'MS4w-test',
    };
    expect(() => validateSource(account)).toThrow('热点来源类型已移除');
    expect(sourceView(account as HotTopicSource)).toMatchObject({
      kind: 'douyinHot',
      isEnabled: false,
    });
    expect(sourceView(account as HotTopicSource)).not.toHaveProperty(
      'accountName',
    );
    expect(sourceView(account as HotTopicSource)).not.toHaveProperty(
      'accountId',
    );
  });
  it('敏感 URL 参数大小写与变体均拒绝，不通过概要泄漏密钥', () => {
    for (const key of [
      'token',
      'ACCESS_TOKEN',
      'accessToken',
      'apiKey',
      'API-KEY',
      'key',
      'secretKey',
    ])
      expect(() =>
        validateSource({
          ...source(),
          url: `https://news.163.com/?${key}=private`,
        }),
      ).toThrow('访问密钥');
  });
});

describe('抖音 Cookie 保存与私密读取', () => {
  const setup = (kind: HotTopicSource['kind'] = 'douyinHot') => {
    const original = {
      ...source(),
      kind,
      isEnabled: true,
      cookieUpdatedAt: new Date('2026-10-26T00:00:00Z'),
    };
    const repository = {
      create: jest.fn((row: unknown) => row),
      save: jest.fn((row: unknown) => Promise.resolve(row)),
      findOne: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ ...original })),
      findAndCount: jest.fn((query: unknown) => {
        void query;
        return Promise.resolve([[original], 1]);
      }),
      find: jest.fn((query: unknown) => {
        void query;
        return Promise.resolve([original]);
      }),
    };
    const cookies = {
      encryptFile: jest.fn().mockReturnValue('encrypted-only'),
      cookieHeader: jest.fn().mockReturnValue('session=test-only'),
    };
    const service = new HotTopicSourcesService(
      repository as unknown as Repository<HotTopicSource>,
      cookies as unknown as HotTopicCookieService,
    );
    return { service, repository, cookies, original };
  };
  const file = {
    cookieFileName: 'cookies.txt',
    cookieFileContent: 'private-file',
  };
  it('文件与来源一次保存，只落密文且响应从不回显凭据', async () => {
    const { service, repository, cookies } = setup();
    const result = await service.create({
      name: '抖音',
      kind: 'douyinHot',
      url: DOUYIN_HOT_URL,
      ...file,
    });
    expect(cookies.encryptFile).toHaveBeenCalledWith(
      'cookies.txt',
      'private-file',
    );
    expect(repository.save).toHaveBeenCalledTimes(1);
    const saved = repository.save.mock.calls[0][0] as HotTopicSource;
    expect(saved.cookieEncrypted).toBe('encrypted-only');
    expect(saved).not.toHaveProperty('cookieFileContent');
    expect(saved).not.toHaveProperty('cookieFileName');
    expect(result).toMatchObject({ hasCookie: true });
    expect(JSON.stringify(result)).not.toMatch(/private-file|encrypted-only/);
  });
  it('未上传保持 select:false 原列，替换与清除使用明确操作', async () => {
    const { service, repository } = setup();
    await service.update(1, { name: '新名字' });
    expect(repository.save.mock.calls[0][0]).not.toHaveProperty(
      'cookieEncrypted',
    );
    await service.update(1, file);
    expect(repository.save.mock.calls[1][0]).toMatchObject({
      cookieEncrypted: 'encrypted-only',
    });
    const result = await service.update(1, { clearCookie: true });
    expect(repository.save.mock.calls[2][0]).toMatchObject({
      cookieEncrypted: null,
      cookieUpdatedAt: null,
    });
    expect(result.hasCookie).toBe(false);
  });
  it('拒绝半个文件、上传同时清除、其它平台上传，校验失败不保存', async () => {
    const { service, repository, cookies } = setup();
    await expect(
      service.update(1, { cookieFileName: 'x.txt' }),
    ).rejects.toThrow('完整');
    await expect(
      service.update(1, { ...file, clearCookie: true }),
    ).rejects.toThrow('同时');
    await expect(
      service.update(1, {
        ...file,
        kind: 'weiboHot',
        url: 'https://weibo.com/hot',
      }),
    ).rejects.toThrow('仅抖音');
    cookies.encryptFile.mockImplementation(() => {
      throw new Error('invalid-format');
    });
    await expect(service.update(1, file)).rejects.toThrow('invalid-format');
    expect(repository.save).not.toHaveBeenCalled();
  });
  it('从抖音切到其它来源会清除凭据，不会转交其它平台', async () => {
    const { service, repository, cookies } = setup();
    await service.update(1, { kind: 'neteaseNews' });
    expect(repository.save.mock.calls[0][0]).toMatchObject({
      kind: 'neteaseNews',
      cookieEncrypted: null,
      cookieUpdatedAt: null,
    });
    expect(cookies.encryptFile).not.toHaveBeenCalled();
  });
  it('列表、选项、详情只返回配置状态，查询不选择密文', async () => {
    const { service, repository } = setup();
    await expect(service.findAll({})).resolves.toMatchObject({
      list: [{ hasCookie: true }],
    });
    await service.options();
    await service.findOne(1);
    expect(repository.findAndCount.mock.calls[0][0]).not.toHaveProperty(
      'select.cookieEncrypted',
    );
    expect(repository.find.mock.calls[0][0]).not.toHaveProperty(
      'select.cookieEncrypted',
    );
    const raw = {
      ...source(),
      kind: 'douyinHot',
      cookieEncrypted: 'never-return',
      cookieUpdatedAt: new Date(),
    } as HotTopicSource;
    expect(sourceView(raw)).not.toHaveProperty('cookieEncrypted');
  });
  it('凭据仅按启用的抖音来源编号显式读取；过期异常不吞掉', async () => {
    const { service, repository, cookies } = setup();
    repository.findOne.mockResolvedValue({ cookieEncrypted: 'encrypted-only' });
    await expect(service.douyinCookie(1)).resolves.toBe('session=test-only');
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 1, kind: 'douyinHot', isEnabled: true },
      select: { id: true, cookieEncrypted: true },
    });
    expect(cookies.cookieHeader).toHaveBeenCalledWith('encrypted-only');
    cookies.cookieHeader.mockImplementation(() => {
      throw new Error('expired');
    });
    await expect(service.douyinCookie(1)).rejects.toThrow('expired');
    repository.findOne.mockClear();
    await expect(service.douyinCookie(0)).resolves.toBeUndefined();
    expect(repository.findOne).not.toHaveBeenCalled();
  });
});
