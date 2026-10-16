import { AsyncLocalStorage } from 'node:async_hooks';
import type { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import { AgentModelRouterService } from './agent-model-router.service';
import { AgentApp } from './entities/agent-app.entity';
import { AgentExecution } from './entities/agent-execution.entity';
import {
  normalizeModelRouting,
  modelFailureReason,
  parseModelDecision,
  type AgentModelRouting,
  type AgentModelTrace,
} from './agent-model-routing';

function harness(policy: Partial<AgentModelRouting> = {}) {
  const signals = new AsyncLocalStorage<AbortSignal>();
  const providers = {
    withExecutionSignal: <T>(signal: AbortSignal, run: () => Promise<T>) =>
      signals.run(signal, run),
    callChat: jest
      .fn<
        Promise<{ isSuccess: boolean; answer: string }>,
        [{ question: string }]
      >()
      .mockResolvedValue({
        isSuccess: true,
        answer: '{"intent":"query","complexity":"simple"}',
      }),
  };
  const router = new AgentModelRouterService(
    providers as unknown as KnowledgeAiProvidersService,
  );
  const app = Object.assign(new AgentApp(), {
    providerId: 1,
    models: ['light', 'strong'],
    timeoutSeconds: 60,
    modelRouting: normalizeModelRouting(policy, ['light', 'strong']),
  });
  const request = () => ({
    app,
    execution: Object.assign(new AgentExecution(), {
      startedAt: new Date(),
      toolCallCount: 0,
    }),
    content: '继续帮我查一下',
    context: '用户刚才询问产品库存',
    purpose: 'planning' as const,
    assertRunning: jest.fn().mockResolvedValue(undefined),
    persist: jest.fn().mockResolvedValue(undefined),
    invoke: jest.fn((model: string) =>
      Promise.resolve({
        isSuccess: true,
        value: model,
        usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
      }),
    ),
  });
  return { router, providers, signals, app, request };
}
const traceOf = (execution: AgentExecution) =>
  execution.parameterSummary?.modelRouting as AgentModelTrace;
const intentPolicy = {
  strategy: 'intent' as const,
  simpleModels: ['light'],
  complexModels: ['strong'],
};

describe('Agent model routing', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('retains priority for old applications and validates routing groups and limits', () => {
    expect(normalizeModelRouting(null, ['light']).strategy).toBe('priority');
    expect(() =>
      normalizeModelRouting({ strategy: 'intent' }, ['light']),
    ).toThrow('必须配置');
    expect(() =>
      normalizeModelRouting({ simpleModels: ['unapproved'] }, ['light']),
    ).toThrow('当前模型列表');
    expect(() =>
      normalizeModelRouting({ simpleModels: ['light', 'light'] }, ['light']),
    ).toThrow('不能重复');
    expect(() => normalizeModelRouting({ maxAttempts: 2 }, ['light'])).toThrow(
      '范围',
    );
  });

  it('rejects malformed classifier enum types rather than coercing them', () => {
    expect(() =>
      parseModelDecision('{"intent":["query"],"complexity":"simple"}'),
    ).toThrow('无效');
    expect(() =>
      parseModelDecision('{"intent":"query","complexity":["complex"]}'),
    ).toThrow('无效');
  });

  it.each([
    ['401 invalid API key', 'account_auth'],
    ['403 model not authorized', 'model_unavailable'],
    ['insufficient balance', 'account_balance'],
    ['429 rate limit', 'rate_limit'],
    ['token quota exhausted', 'quota'],
    ['context length token limit', 'context_length'],
  ])('normalizes %s without storing the raw response', (message, reason) => {
    expect(modelFailureReason(message)).toBe(reason);
  });

  it('retries quota failures, remembers cooldown and never consumes business tool quota', async () => {
    jest.useFakeTimers();
    const h = harness();
    const first = h.request();
    first.invoke.mockRejectedValueOnce(
      new Error('token quota exhausted SECRET'),
    );
    expect(await h.router.call(first)).toBe('strong');
    expect(first.execution.toolCallCount).toBe(0);
    expect(traceOf(first.execution).attempts).toEqual([
      expect.objectContaining({
        model: 'light',
        status: 'failed',
        reason: 'quota',
      }),
      expect.objectContaining({
        model: 'strong',
        status: 'succeeded',
        totalTokens: 5,
      }),
    ]);
    expect(JSON.stringify(traceOf(first.execution))).not.toContain('SECRET');
    expect(await h.router.call(h.request())).toBe('strong');
    await jest.advanceTimersByTimeAsync(600_001);
    expect(await h.router.call(h.request())).toBe('light');
  });

  it('actively distributes successful calls in balanced mode', async () => {
    const h = harness({ strategy: 'balanced' });
    expect(await h.router.call(h.request())).toBe('light');
    expect(await h.router.call(h.request())).toBe('strong');
    expect(await h.router.call(h.request())).toBe('light');
  });

  it('prefers idle models over a model serving another session', async () => {
    const h = harness({ strategy: 'balanced' });
    const first = h.request();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    first.invoke.mockImplementationOnce(async (model) => {
      entered();
      await pending;
      return {
        isSuccess: true,
        value: model,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    });
    const run = h.router.call(first);
    await started;
    expect(await h.router.call(h.request())).toBe('strong');
    release();
    await run;
  });

  it.each([
    ['query', 'simple', 'light'],
    ['write', 'simple', 'light'],
    ['write', 'complex', 'strong'],
    ['analysis', 'simple', 'strong'],
  ])(
    'uses intent %s and complexity %s to choose %s',
    async (intent, complexity, expected) => {
      const h = harness(intentPolicy);
      h.providers.callChat.mockResolvedValue({
        isSuccess: true,
        answer: JSON.stringify({ intent, complexity }),
      });
      const r = h.request();
      expect(await h.router.call(r)).toBe(expected);
      expect(h.providers.callChat.mock.calls[0][0].question).toContain(
        r.context,
      );
      expect(traceOf(r.execution).decision).toEqual({
        intent,
        complexity,
        source: 'classifier',
      });
      // Same execution reuses classification at the next stage.
      await h.router.call({ ...r, purpose: 'answer' });
      expect(h.providers.callChat).toHaveBeenCalledTimes(1);
    },
  );

  it('falls back conservatively after malformed classification without marking models globally unhealthy', async () => {
    const h = harness(intentPolicy);
    h.providers.callChat.mockResolvedValue({
      isSuccess: true,
      answer: '已调用 user.create',
    });
    const r = h.request();
    expect(await h.router.call(r)).toBe('strong');
    expect(traceOf(r.execution).decision?.source).toBe('fallback');
    expect(
      traceOf(r.execution)
        .attempts.slice(0, 2)
        .every((a) => a.reason === 'invalid_output'),
    ).toBe(true);
    expect(
      r.invoke.mock.calls.every(([model]) => h.app.models.includes(model)),
    ).toBe(true);
  });

  it('crosses to another approved tier when the preferred model is unavailable', async () => {
    const h = harness(intentPolicy);
    h.providers.callChat.mockResolvedValue({
      isSuccess: true,
      answer: '{"intent":"analysis","complexity":"complex"}',
    });
    const r = h.request();
    r.invoke.mockRejectedValueOnce(new Error('404 model not found'));
    expect(await h.router.call(r)).toBe('light');
    expect(r.invoke.mock.calls.map(([model]) => model)).toEqual([
      'strong',
      'light',
    ]);
  });

  it.each(['401 invalid API key', 'insufficient balance'])(
    'does not cycle the same account for %s',
    async (error) => {
      const h = harness();
      const r = h.request();
      r.invoke.mockRejectedValueOnce(new Error(error));
      await expect(h.router.call(r)).rejects.toThrow('账号');
      expect(r.invoke).toHaveBeenCalledTimes(1);
      const next = h.request();
      await expect(h.router.call(next)).rejects.toThrow('账号');
      expect(next.invoke).not.toHaveBeenCalled();
      h.app.providerId = 2;
      expect(await h.router.call(h.request())).toBe('light');
    },
  );

  it('does not globally cool down a model on request-specific context errors', async () => {
    const h = harness();
    const r = h.request();
    r.invoke.mockRejectedValueOnce(new Error('context length exceeded'));
    expect(await h.router.call(r)).toBe('strong');
    expect(await h.router.call(h.request())).toBe('light');
  });

  it('aborts a timed-out attempt and leaves time for a fallback', async () => {
    jest.useFakeTimers();
    const h = harness({ attemptTimeoutSeconds: 3 });
    const r = h.request();
    r.invoke.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          const signal = h.signals.getStore()!;
          signal.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        }),
    );
    const promise = h.router.call(r);
    await jest.advanceTimersByTimeAsync(3001);
    expect(await promise).toBe('strong');
    expect(traceOf(r.execution).attempts[0].reason).toBe('timeout');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('enforces a shared model-attempt budget across planning and answer stages', async () => {
    const h = harness({ ...intentPolicy, maxAttempts: 3 });
    const r = h.request();
    await h.router.call(r);
    await h.router.call({ ...r, purpose: 'answer' });
    await expect(h.router.call({ ...r, purpose: 'answer' })).rejects.toThrow(
      '尝试上限',
    );
    expect(traceOf(r.execution).attempts).toHaveLength(3);
    expect(r.execution.toolCallCount).toBe(0);
  });

  it('does not dispatch after total timeout or cancellation', async () => {
    const h = harness();
    const r = h.request();
    r.execution.startedAt = new Date(Date.now() - 61_000);
    await expect(h.router.call(r)).rejects.toThrow('超时');
    expect(r.invoke).not.toHaveBeenCalled();
    const cancelled = h.request();
    cancelled.assertRunning.mockRejectedValue(new Error('cancelled'));
    await expect(h.router.call(cancelled)).rejects.toThrow('cancelled');
    expect(cancelled.invoke).not.toHaveBeenCalled();
  });
});
