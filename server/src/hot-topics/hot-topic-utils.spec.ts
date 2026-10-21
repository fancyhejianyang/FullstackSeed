import {
  HOT_TOPIC_DEADLINE_MS,
  nextScheduledAt,
  parseTopicAnalysis,
  safeHotTopicError,
  topicUrlHash,
} from './hot-topic-utils';

describe('热点任务协议', () => {
  it('整体执行期限固定五分钟', () => {
    expect(HOT_TOPIC_DEADLINE_MS).toBe(300000);
  });
  it('按上海时间取最近下一个执行点，不受服务器时区影响', () => {
    expect(
      nextScheduledAt('08:30', new Date('2026-10-21T00:29:00Z')).toISOString(),
    ).toBe('2026-10-21T00:30:00.000Z');
    expect(
      nextScheduledAt('08:30', new Date('2026-10-21T00:30:00Z')).toISOString(),
    ).toBe('2026-10-22T00:30:00.000Z');
    expect(
      nextScheduledAt('00:05', new Date('2026-10-21T23:30:00Z')).toISOString(),
    ).toBe('2026-10-22T16:05:00.000Z');
  });
  it('同一文章不同追踪参数仍归为同一事件，正文参数不能误删', () => {
    expect(
      topicUrlHash('https://www.douyin.com/video/1?utm_source=a&from=search'),
    ).toBe(topicUrlHash('https://www.douyin.com/video/1'));
    expect(topicUrlHash('https://example.com/article?id=1')).not.toBe(
      topicUrlHash('https://example.com/article?id=2'),
    );
  });
  it('只接受有效编号和封闭推荐字段，不信任模型任意数据', () => {
    const row = {
      index: 0,
      recommendationLevel: 'high',
      reason: '符合科技兴趣',
      suggestedAngles: ['解释对普通人的影响'],
      materialCompleteness: 'summary',
      url: 'https://fabricated.example',
    };
    expect(parseTopicAnalysis(JSON.stringify([row]), 1)[0]).not.toHaveProperty(
      'url',
    );
    expect(() =>
      parseTopicAnalysis(JSON.stringify([{ ...row, index: 2 }]), 1),
    ).toThrow('编号');
    expect(() => parseTopicAnalysis(JSON.stringify([row, row]), 2)).toThrow(
      '编号',
    );
    expect(() =>
      parseTopicAnalysis(JSON.stringify([{ ...row, suggestedAngles: [1] }]), 1),
    ).toThrow('字段');
    expect(() =>
      parseTopicAnalysis(
        JSON.stringify([{ ...row, recommendationLevel: 'urgent' }]),
        1,
      ),
    ).toThrow('字段');
  });
  it('聚合热榜或账号主页不同标题不互相覆盖，视频链接仍按 URL 更新', () => {
    expect(topicUrlHash('https://www.douyin.com/hot', '新闻一')).not.toBe(
      topicUrlHash('https://www.douyin.com/hot', '新闻二'),
    );
    expect(topicUrlHash('https://www.douyin.com/search', '新闻一')).not.toBe(
      topicUrlHash('https://www.douyin.com/search', '新闻二'),
    );
    expect(topicUrlHash('https://www.douyin.com/user/id', '新闻一')).not.toBe(
      topicUrlHash('https://www.douyin.com/user/id', '新闻二'),
    );
    expect(topicUrlHash('https://www.douyin.com/video/1', '新闻一')).toBe(
      topicUrlHash('https://www.douyin.com/video/1', '新闻二'),
    );
    expect(topicUrlHash('https://www.douyin.com/hot', '  新闻　标题  ')).toBe(
      topicUrlHash('https://www.douyin.com/hot', '新闻 标题'),
    );
  });
  it('错误摘要隐藏常见凭据', () => {
    expect(
      safeHotTopicError(
        new Error(
          'Bearer private-token https://example.com?api_key=secret sk-private',
        ),
      ),
    ).not.toMatch(/private-token|=secret|sk-private/);
  });
});
