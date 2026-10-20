import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import type { ComfyConnection } from './entities/comfy-connection.entity';

type ComfyOutputDescriptor = {
  filename: string;
  subfolder?: string;
  type?: string;
};

@Injectable()
export class ComfyClientService {
  async systemStats(connection: ComfyConnection) {
    return this.requestJson<Record<string, unknown>>(
      connection,
      '/system_stats',
    );
  }

  async submitPrompt(
    connection: ComfyConnection,
    workflow: Record<string, unknown>,
    clientId: string,
  ) {
    return this.requestJson<{
      prompt_id?: string;
      number?: number;
      error?: unknown;
      node_errors?: unknown;
    }>(connection, '/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    });
  }

  async queue(connection: ComfyConnection) {
    return this.requestJson<{
      queue_running?: unknown[];
      queue_pending?: unknown[];
    }>(connection, '/queue');
  }

  async history(connection: ComfyConnection, promptId: string) {
    return this.requestJson<Record<string, unknown>>(
      connection,
      `/history/${encodeURIComponent(promptId)}`,
    );
  }

  async uploadImage(
    connection: ComfyConnection,
    file: { buffer: Buffer; fileName: string; mimeType: string },
  ) {
    const form = new FormData();
    const bytes = new Uint8Array(file.buffer.length);
    bytes.set(file.buffer);
    form.append(
      'image',
      new Blob([bytes], { type: file.mimeType }),
      file.fileName,
    );
    form.append('type', 'input');
    form.append('overwrite', 'false');
    return this.requestJson<{
      name?: string;
      subfolder?: string;
      type?: string;
    }>(connection, '/upload/image', { method: 'POST', body: form });
  }

  async downloadOutput(
    connection: ComfyConnection,
    output: ComfyOutputDescriptor,
  ) {
    if (!output.filename || output.filename.includes('..')) {
      throw new BadRequestException('ComfyUI 输出文件名无效');
    }
    const params = new URLSearchParams({
      filename: output.filename,
      subfolder: output.subfolder || '',
      type: output.type || 'output',
    });
    const response = await this.request(
      connection,
      `/view?${params.toString()}`,
      {},
      Math.max(connection.requestTimeoutMs, 120_000),
    );
    const size = Number(response.headers.get('content-length') || 0);
    if (size > 250 * 1024 * 1024) {
      throw new BadGatewayException('ComfyUI 输出文件超过 250MB 限制');
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 250 * 1024 * 1024) {
      throw new BadGatewayException('ComfyUI 输出文件超过 250MB 限制');
    }
    return {
      buffer,
      fileName: output.filename,
      mimeType:
        response.headers.get('content-type') ||
        this.mimeFromFileName(output.filename),
    };
  }

  private async requestJson<T>(
    connection: ComfyConnection,
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await this.request(connection, path, init);
    const text = await response.text();
    if (text.length > 8 * 1024 * 1024) {
      throw new BadGatewayException('ComfyUI 响应过大');
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new BadGatewayException('ComfyUI 返回了无法解析的数据');
    }
  }

  private async request(
    connection: ComfyConnection,
    path: string,
    init: RequestInit = {},
    timeoutMs = connection.requestTimeoutMs,
  ) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = new Headers(init.headers);
      this.applyAuth(headers, connection);
      const response = await fetch(
        `${connection.baseUrl.replace(/\/+$/, '')}${path}`,
        {
          ...init,
          headers,
          signal: controller.signal,
          redirect: 'error',
        },
      );
      if (!response.ok) {
        throw new BadGatewayException(
          `ComfyUI 请求失败（HTTP ${response.status}）`,
        );
      }
      return response;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      if ((error as Error).name === 'AbortError') {
        throw new BadGatewayException('ComfyUI 请求超时');
      }
      throw new BadGatewayException('无法连接 ComfyUI 服务');
    } finally {
      clearTimeout(timer);
    }
  }

  private applyAuth(headers: Headers, connection: ComfyConnection) {
    if (connection.authType === 'basic') {
      const token = Buffer.from(
        `${connection.username || ''}:${connection.secret || ''}`,
      ).toString('base64');
      headers.set('Authorization', `Basic ${token}`);
    } else if (connection.authType === 'bearer' && connection.secret) {
      headers.set('Authorization', `Bearer ${connection.secret}`);
    }
  }

  private mimeFromFileName(fileName: string) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.mp4')) return 'video/mp4';
    if (lower.endsWith('.webm')) return 'video/webm';
    return 'application/octet-stream';
  }
}
