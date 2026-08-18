import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export type TaskQueueStatus = 'pending' | 'running' | 'success' | 'failed';

export interface TaskQueueRecord {
  id: string;
  name: string;
  status: TaskQueueStatus;
  payload?: Record<string, unknown>;
  result?: unknown;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

@Injectable()
export class TaskQueueService {
  private readonly tasks = new Map<string, TaskQueueRecord>();
  private readonly queue: Array<{
    record: TaskQueueRecord;
    handler: () => Promise<unknown>;
  }> = [];
  private running = false;

  add(
    name: string,
    payload: Record<string, unknown>,
    handler: () => Promise<unknown>,
  ) {
    const record: TaskQueueRecord = {
      id: randomUUID(),
      name,
      payload,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.tasks.set(record.id, record);
    this.queue.push({ record, handler });
    void this.drain();
    return this.toResult(record);
  }

  find(id: string) {
    const record = this.tasks.get(id);
    return record ? this.toResult(record) : null;
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const item = this.queue.shift();
        if (!item) continue;
        await this.runTask(item.record, item.handler);
      }
    } finally {
      this.running = false;
    }
  }

  private async runTask(
    record: TaskQueueRecord,
    handler: () => Promise<unknown>,
  ) {
    record.status = 'running';
    record.startedAt = new Date().toISOString();
    try {
      record.result = await handler();
      record.status = 'success';
    } catch (error) {
      record.status = 'failed';
      record.errorMessage =
        error instanceof Error ? error.message : '任务执行失败';
    } finally {
      record.finishedAt = new Date().toISOString();
    }
  }

  private toResult(record: TaskQueueRecord) {
    return {
      taskId: record.id,
      name: record.name,
      status: record.status,
      payload: record.payload,
      result: record.result,
      errorMessage: record.errorMessage,
      createdAt: record.createdAt,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
    };
  }
}
