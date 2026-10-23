import { Repository } from 'typeorm';
import { HotTopicSource } from './entities/hot-topic.entity';
import {
  HotTopicSourcesService,
  sourceView,
  validateSource,
} from './hot-topic-sources.service';

const source = () =>
  ({
    id: 1,
    name: '授权 Feed',
    kind: 'jsonFeed',
    accessMode: 'feed',
    url: 'https://feed.example.com/news.json',
    accountName: '',
    accountId: '',
    apiToken: 'private-token',
    isEnabled: false,
    description: '',
  }) as HotTopicSource;

describe('热点来源配置', () => {
  it('详情安全视图只返回是否存在密钥', () => {
    expect(sourceView(source())).toMatchObject({ hasApiToken: true });
    expect(sourceView(source())).not.toHaveProperty('apiToken');
  });
  it('阻止本地、明文、凭据 URL', () => {
    for (const url of [
      'http://feed.example.com',
      'https://127.0.0.1',
      'https://user:password@example.com',
      'https://feed.example.com?token=abc',
    ])
      expect(() => validateSource({ ...source(), url })).toThrow();
  });
  it('热点页面来源允许平台自有页与第三方聚合页', () => {
    // 热榜既可以是平台自有页面，也可以是合规聚合页（如 tophub.today 的微博热搜榜）。
    for (const url of [
      'https://www.douyin.com/hot',
      'https://s.weibo.com/top/summary',
      'https://tophub.today/n/KqndgxeLl9',
    ])
      expect(() =>
        validateSource({
          ...source(),
          apiToken: null,
          kind: (url.includes('douyin') ? 'douyinHot' : 'weiboHot') as const,
          accessMode: 'page',
          url,
        }),
      ).not.toThrow();
    expect(() =>
      validateSource({
        ...source(),
        apiToken: null,
        kind: 'weiboHot',
        accessMode: 'feed',
        url: 'https://tophub.today/n/KqndgxeLl9',
      }),
    ).toThrow('公开页面或 AI 搜索');
  });
  it('拒绝新增历史账号类型并以停用的普通页面兼容旧记录', () => {
    const account = {
      ...source(),
      apiToken: null,
      kind: 'douyinAccount' as const,
      accessMode: 'page' as const,
      url: 'https://www.douyin.com/user/MS4w-test',
      accountName: '央视新闻',
      accountId: 'MS4w-test',
    };
    expect(() => validateSource(account)).toThrow('指定账号来源已移除');
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
          url: `https://feed.example.com/?${key}=private`,
        }),
      ).toThrow('密钥字段');
  });
  it('编辑空密钥保留旧值，显式清除才删除', async () => {
    const row = source();
    const builder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(row),
    };
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(builder),
      save: jest
        .fn()
        .mockImplementation((value: HotTopicSource) => Promise.resolve(value)),
    };
    const service = new HotTopicSourcesService(
      repository as unknown as Repository<HotTopicSource>,
    );
    const preserved = await service.update(1, { apiToken: '' });
    expect(row.apiToken).toBe('private-token');
    expect(preserved.hasApiToken).toBe(true);
    expect(preserved).not.toHaveProperty('apiToken');
    await service.update(1, { clearApiToken: true });
    expect(row.apiToken).toBeNull();
  });
});
