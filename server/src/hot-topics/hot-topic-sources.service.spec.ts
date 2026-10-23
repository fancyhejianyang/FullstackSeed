import { HotTopicSource } from './entities/hot-topic.entity';
import { sourceView, validateSource } from './hot-topic-sources.service';
import { NETEASE_NEWS_URL } from './hot-topic.types';

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
          kind: (url.includes('douyin') ? 'douyinHot' : 'weiboHot') as const,
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
  it('网易国内新闻仅接受系统固定接口与页面读取方式', () => {
    expect(() =>
      validateSource({ ...source(), url: 'https://news.163.com/domestic/' }),
    ).toThrow('固定新闻接口地址');
    expect(() => validateSource({ ...source(), accessMode: 'search' })).toThrow(
      '仅支持固定新闻接口读取',
    );
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
