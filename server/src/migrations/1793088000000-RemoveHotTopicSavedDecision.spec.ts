import { RemoveHotTopicSavedDecision1793088000000 } from './1793088000000-RemoveHotTopicSavedDecision';

describe('移除热点收藏状态迁移', () => {
  it('将已有收藏安全恢复为未处理', async () => {
    const runner = {
      hasTable: jest.fn().mockResolvedValue(true),
      query: jest.fn(),
    };

    await new RemoveHotTopicSavedDecision1793088000000().up(runner as never);

    expect(runner.query).toHaveBeenCalledWith(
      "UPDATE `hot_topics` SET `decision` = 'new' WHERE `decision` = 'saved'",
    );
  });
});
