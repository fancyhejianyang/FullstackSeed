import { KnowledgeAiChatService } from './knowledge-ai-chat.service';

describe('接待调度与原问答引擎边界', () => {
  function setup() {
    const sessionRepository = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn(),
    };
    const messageRepository = {
      create: jest.fn((value: unknown) => value),
      save: jest.fn().mockResolvedValue({ id: 5 }),
    };
    const providers = {
      withExecutionSignal: jest.fn((_signal, run: () => Promise<unknown>) => run()),
    };
    const service = new KnowledgeAiChatService(
      sessionRepository as never, messageRepository as never,
      {} as never, {} as never, providers as never, {} as never,
    );
    return { service, sessionRepository, messageRepository, providers };
  }

  it('后台测试入口不能绕过应用调度操作访客会话', async () => {
    const { service, sessionRepository, messageRepository } = setup();
    sessionRepository.findOne.mockResolvedValue({ id: 8, externalAppId: 1 });
    await expect(service.ask({ sessionId: 8, question: '问题' })).rejects.toThrow('应用会话必须通过客服接待接口');
    expect(messageRepository.save).not.toHaveBeenCalled();
  });

  it('已取消的任务在创建问答记录前即退出', async () => {
    const { service, sessionRepository, messageRepository, providers } = setup();
    const controller = new AbortController();
    controller.abort(new Error('任务已取消'));
    await expect(service.askStream(
      { sessionId: 8, question: '问题' }, { writeEvent: jest.fn() }, undefined,
      { signal: controller.signal },
    )).rejects.toThrow('任务已取消');
    expect(providers.withExecutionSignal).toHaveBeenCalled();
    expect(sessionRepository.findOne).not.toHaveBeenCalled();
    expect(messageRepository.save).not.toHaveBeenCalled();
  });

  it('旧任务在接待版本失效后不能继续执行', async () => {
    const { service, messageRepository } = setup();
    await expect(service.askStream(
      { sessionId: 8, question: '问题' }, { writeEvent: jest.fn() }, undefined,
      { signal: new AbortController().signal, isCurrent: () => false },
    )).rejects.toThrow('AI 任务已取消或已转人工');
    expect(messageRepository.save).not.toHaveBeenCalled();
  });

  it('原AI统计写入不会覆盖人工接待状态或归属字段', async () => {
    const { service, sessionRepository } = setup();
    const session = { id: 8, externalAppId: 2, messageCount: 0, serviceStatus: 'ai', serviceVersion: 3, assignedAgentId: null };
    await service['saveMessage'](
      { question: '问题' }, session as never,
      { providerId: 1, providerName: '测试模型', model: 'test' } as never,
      { isSuccess: true, model: 'test', answer: '答案', errorMessage: null, elapsedMilliseconds: 1, usage: null },
    );
    expect(sessionRepository.save).not.toHaveBeenCalled();
    expect(sessionRepository.update.mock.calls[0][0]).toEqual({ id: 8, serviceStatus: 'ai', serviceVersion: 3 });
    const fields = sessionRepository.update.mock.calls[0][1];
    expect(fields).not.toHaveProperty('serviceStatus');
    expect(fields).not.toHaveProperty('serviceVersion');
    expect(fields).not.toHaveProperty('assignedAgentId');
    expect(fields.lastAnswer).toBe('答案');
  });

  it('写入问答明细期间发生接手，不再用迟到结果改写会话摘要', async () => {
    const { service, sessionRepository, messageRepository } = setup();
    const controller = new AbortController();
    messageRepository.save.mockImplementation(async () => {
      controller.abort(new Error('客服已接手'));
      return { id: 5 };
    });
    await expect(service['executionContext'].run({ signal: controller.signal }, () => service['saveMessage'](
      { question: '问题' }, { id: 8, externalAppId: 2, serviceVersion: 3, messageCount: 1 } as never,
      { providerId: 1, providerName: '测试', model: 'test' } as never,
      { isSuccess: true, model: 'test', answer: '迟到结果', errorMessage: null, elapsedMilliseconds: 1, usage: null },
    ))).rejects.toThrow('客服已接手');
    expect(sessionRepository.update).not.toHaveBeenCalled();
  });
});
