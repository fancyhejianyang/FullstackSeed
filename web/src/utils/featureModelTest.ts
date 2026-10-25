export interface ModelTestJobContext {
  isCurrent: () => boolean;
  isOpen: () => boolean;
}

interface QueueOptions<T, R> {
  delayMs?: number;
  run: (value: T, context: ModelTestJobContext) => Promise<R>;
  onResult: (value: T, result: R, context: ModelTestJobContext) => void;
  onError: (value: T, error: unknown, context: ModelTestJobContext) => void;
  onState?: (busy: boolean, queued: boolean) => void;
  canReuseActive?: (value: T) => boolean;
}

/** 合并快速选择并串行提交；已发出的请求只接收结果，不取消后重投。 */
export class FeatureModelTestQueue<T, R> {
  private opened = false;
  private epoch = 0;
  private sequence = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending?: {
    value: T;
    key: string;
    sequence: number;
    epoch: number;
    ready: boolean;
  };
  private active?: { value: T; key: string; sequence: number; epoch: number };

  private readonly options: QueueOptions<T, R>;
  constructor(options: QueueOptions<T, R>) {
    this.options = options;
  }

  open() {
    this.epoch += 1;
    this.opened = true;
    this.cancelPending();
  }

  close() {
    this.opened = false;
    this.epoch += 1;
    this.cancelPending();
  }

  cancelPending() {
    this.sequence += 1;
    this.pending = undefined;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.changed();
  }

  activeValueFor(key: string): T | undefined {
    return this.active?.epoch === this.epoch &&
      this.active.key === key &&
      this.options.canReuseActive?.(this.active.value) !== false
      ? this.active.value
      : undefined;
  }

  schedule(value: T, key: string, immediate = false): T {
    this.cancelPending();
    if (!this.opened) return value;
    if (this.activeValueFor(key) !== undefined && this.active) {
      this.active.sequence = this.sequence;
      return this.active.value;
    }
    this.pending = {
      value,
      key,
      sequence: this.sequence,
      epoch: this.epoch,
      ready: immediate,
    };
    if (immediate) void this.flush();
    else
      this.timer = setTimeout(() => {
        this.timer = undefined;
        if (this.pending) this.pending.ready = true;
        void this.flush();
      }, this.options.delayMs ?? 400);
    this.changed();
    return value;
  }

  private changed() {
    this.options.onState?.(!!this.active, !!this.pending);
  }

  private async flush() {
    if (this.active || !this.opened || !this.pending?.ready) return;
    const job = this.pending;
    this.pending = undefined;
    this.active = job;
    const context = {
      isOpen: () => this.opened && job.epoch === this.epoch,
      isCurrent: () =>
        this.opened &&
        job.epoch === this.epoch &&
        job.sequence === this.sequence,
    };
    this.changed();
    try {
      const result = await this.options.run(job.value, context);
      if (context.isOpen()) this.options.onResult(job.value, result, context);
    } catch (error) {
      if (context.isOpen()) this.options.onError(job.value, error, context);
    } finally {
      this.active = undefined;
      this.changed();
      void this.flush();
    }
  }
}

/** 服务器结果优先于本地占位/网络错误，不能跨客户端和服务器时钟比较。 */
export class FeatureModelTestHistory<
  R extends { requestId: string; status: string; checkedAt: string },
> {
  private entries: R[] = [];
  private readonly local = new Set<string>();
  private readonly limit: number;
  constructor(limit = 10) {
    this.limit = limit;
  }
  clear() {
    this.entries = [];
    this.local.clear();
  }
  store(result: R, local = false, prioritize = true): R[] {
    const previous = this.entries.find(
      (item) => item.requestId === result.requestId,
    );
    const previousServer = previous && !this.local.has(result.requestId);
    if (
      local &&
      previousServer &&
      ["succeeded", "failed"].includes(previous.status)
    )
      return [...this.entries];
    if (
      !local &&
      previousServer &&
      Date.parse(previous.checkedAt) > Date.parse(result.checkedAt)
    )
      return [...this.entries];
    if (local) this.local.add(result.requestId);
    else this.local.delete(result.requestId);
    if (prioritize)
      this.entries = [
        result,
        ...this.entries.filter((item) => item.requestId !== result.requestId),
      ].slice(0, this.limit);
    else if (previous)
      this.entries = this.entries.map((item) =>
        item.requestId === result.requestId ? result : item,
      );
    else this.entries = [...this.entries, result].slice(0, this.limit);
    return [...this.entries];
  }
}
