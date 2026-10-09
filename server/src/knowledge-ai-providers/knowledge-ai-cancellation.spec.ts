import { KnowledgeAiProvidersService } from './knowledge-ai-providers.service';

describe('问答取消信号隔离', () => {
  const service = new KnowledgeAiProvidersService({} as never, {} as never, {} as never);

  afterEach(() => jest.restoreAllMocks());

  it('将每个并发会话的取消信号传给上游，互不覆盖', async () => {
    const calls: Array<{ url: string; signal: AbortSignal | null | undefined }> = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      calls.push({ url: String(url), signal: init?.signal });
      return new Response('{}');
    });
    const first = new AbortController();
    const second = new AbortController();
    await Promise.all([
      service.withExecutionSignal(first.signal, async () => {
        await Promise.resolve();
        return service['fetchWithExecution']('https://example.invalid/first', {});
      }),
      service.withExecutionSignal(second.signal, async () => {
        await Promise.resolve();
        return service['fetchWithExecution']('https://example.invalid/second', {});
      }),
    ]);
    expect(calls.find((item) => item.url.endsWith('/first'))?.signal).toBe(first.signal);
    expect(calls.find((item) => item.url.endsWith('/second'))?.signal).toBe(second.signal);
    await service['fetchWithExecution']('https://example.invalid/other', {});
    expect(calls.at(-1)?.signal).toBeUndefined();
  });

  it('已取消的任务不会再发起摘要或提词请求', async () => {
    const fetch = jest.spyOn(global, 'fetch');
    const controller = new AbortController();
    controller.abort(new Error('已转人工'));
    await expect(service.withExecutionSignal(controller.signal, async () =>
      service['fetchWithExecution']('https://example.invalid/cancelled', {}),
    )).rejects.toThrow('已转人工');
    expect(fetch).not.toHaveBeenCalled();
  });
});
