import { Injectable } from '@nestjs/common';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

@Injectable()
export class KnowledgeTaskFileLogger {
  private readonly logDir = join(process.cwd(), 'logs');
  private readonly logFile = join(this.logDir, 'knowledge-tasks.log');

  async write(event: string, payload: Record<string, unknown>) {
    try {
      await mkdir(this.logDir, { recursive: true });
      await appendFile(
        this.logFile,
        `${JSON.stringify({
          time: new Date().toISOString(),
          event,
          ...payload,
        })}\n`,
        'utf8',
      );
    } catch {
      // 文件日志只用于排查任务链路，写入失败不能影响业务解析流程。
    }
  }
}
