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

type ComfyRequestOptions = {
  redirect?: RequestRedirect;
  acceptedStatuses?: number[];
};

@Injectable()
export class ComfyClientService {
  async systemStats(connection: ComfyConnection) {
    const stats = await this.requestJson<Record<string, unknown>>(
      connection,
      '/system_stats',
    );
    if (!this.isOfficialComfyCloud(connection)) return stats;
    const user = await this.requestJson<{ status?: string }>(
      connection,
      '/user',
    );
    return { ...stats, cloudUserStatus: user.status ?? null };
  }

  async submitPrompt(
    connection: ComfyConnection,
    workflow: Record<string, unknown>,
    clientId: string,
  ) {
    const body = this.isOfficialComfyCloud(connection)
      ? { prompt: workflow }
      : { prompt: workflow, client_id: clientId };
    return this.requestJson<{
      prompt_id?: string;
      number?: number;
      error?: unknown;
      node_errors?: unknown;
    }>(connection, '/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async queue(connection: ComfyConnection) {
    return this.requestJson<{
      queue_running?: unknown[];
      queue_pending?: unknown[];
    }>(connection, '/queue');
  }

  async history(connection: ComfyConnection, promptId: string) {
    if (this.isOfficialComfyCloud(connection)) {
      const encodedId = encodeURIComponent(promptId);
      const status = await this.requestJson<{
        status?: string;
        error_message?: string | null;
      }>(connection, `/job/${encodedId}/status`);
      const state = status.status ?? 'pending';
      const terminal = [
        'completed',
        'success',
        'succeeded',
        'error',
        'failed',
        'cancelled',
      ].includes(state);
      const history = terminal
        ? await this.requestJson<Record<string, unknown>>(
            connection,
            `/history/${encodedId}`,
          )
        : {};
      const nestedDetail = history[promptId];
      const detail =
        nestedDetail &&
        typeof nestedDetail === 'object' &&
        !Array.isArray(nestedDetail)
          ? (nestedDetail as Record<string, unknown>)
          : history;
      return {
        [promptId]: {
          ...detail,
          outputs: detail.outputs ?? {},
          status: {
            status_str: this.normalizeCloudStatus(state),
            completed: terminal,
          },
          errorMessage: status.error_message ?? detail.execution_error ?? null,
        },
      };
    }
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
    let response = await this.request(
      connection,
      `/view?${params.toString()}`,
      {},
      Math.max(connection.requestTimeoutMs, 120_000),
      this.isOfficialComfyCloud(connection)
        ? {
            redirect: 'manual',
            acceptedStatuses: [301, 302, 303, 307, 308],
          }
        : undefined,
    );
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new BadGatewayException('Comfy Cloud 未返回输出下载地址');
      }
      response = await this.downloadSignedOutput(
        location,
        Math.max(connection.requestTimeoutMs, 120_000),
      );
    }
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
      const contentType = response.headers.get('content-type') || '未知类型';
      throw new BadGatewayException(
        `ComfyUI 返回非 JSON 数据（${contentType}），请检查服务地址是否为 API 根地址`,
      );
    }
  }

  private async request(
    connection: ComfyConnection,
    path: string,
    init: RequestInit = {},
    timeoutMs = connection.requestTimeoutMs,
    options: ComfyRequestOptions = {},
  ) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = new Headers(init.headers);
      this.applyAuth(headers, connection);
      const url = this.buildUrl(connection, path);
      const response = await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
        redirect: options.redirect ?? 'error',
      });
      if (
        !response.ok &&
        !(options.acceptedStatuses ?? []).includes(response.status)
      ) {
        throw new BadGatewayException(
          await this.statusError(connection, response, path, init.method),
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
    if (this.isOfficialComfyCloud(connection) && connection.secret) {
      headers.set('X-API-Key', connection.secret);
      return;
    }
    if (connection.authType === 'basic') {
      const token = Buffer.from(
        `${connection.username || ''}:${connection.secret || ''}`,
      ).toString('base64');
      headers.set('Authorization', `Basic ${token}`);
    } else if (connection.authType === 'bearer' && connection.secret) {
      headers.set('Authorization', `Bearer ${connection.secret}`);
    } else if (connection.authType === 'apiKey' && connection.secret) {
      headers.set('X-API-Key', connection.secret);
    }
  }

  private buildUrl(connection: ComfyConnection, path: string) {
    let baseUrl = connection.baseUrl.replace(/\/+$/, '');
    if (!this.isOfficialComfyCloud(connection)) return `${baseUrl}${path}`;
    baseUrl = baseUrl.replace(/\/api$/i, '');
    const cloudPath = path.startsWith('/api/') ? path : `/api${path}`;
    return `${baseUrl}${cloudPath}`;
  }

  private isOfficialComfyCloud(connection: ComfyConnection) {
    try {
      return (
        new URL(connection.baseUrl).hostname.toLowerCase() === 'cloud.comfy.org'
      );
    } catch {
      return false;
    }
  }

  private normalizeCloudStatus(status: string) {
    if (['completed', 'success', 'succeeded'].includes(status))
      return 'success';
    if (['error', 'failed', 'cancelled'].includes(status)) return 'error';
    if (['in_progress', 'running'].includes(status)) return 'running';
    return 'queued';
  }

  private async statusError(
    connection: ComfyConnection,
    response: Response,
    path: string,
    method?: string,
  ) {
    const endpoint = this.endpointLabel(connection, path, method);
    const providerDetail = await this.responseErrorDetail(
      response,
      connection.secret,
    );
    const detail = providerDetail ? `：${providerDetail}` : '';
    if (this.isOfficialComfyCloud(connection)) {
      if (response.status === 401) {
        return `Comfy Cloud API Key 无效或已失效（${endpoint}，HTTP 401）${detail}`;
      }
      if (response.status === 402) {
        return `Comfy Cloud 额度不足（${endpoint}，HTTP 402）${detail}`;
      }
      if (response.status === 403) {
        return `Comfy Cloud API 调用仅对付费订阅账户开放（${endpoint}，HTTP 403）${detail}；免费账户只能在网页编辑器中运行，单独充值额度不能解锁 API，必须开通付费订阅`;
      }
      if (response.status === 429) {
        return `Comfy Cloud 请求受限或账号未开通所需套餐（${endpoint}，HTTP 429）${detail}`;
      }
    }
    return `ComfyUI 请求失败（${endpoint}，HTTP ${response.status}）${detail}`;
  }

  private endpointLabel(
    connection: ComfyConnection,
    path: string,
    method?: string,
  ) {
    const requestMethod = (method || 'GET').toUpperCase();
    try {
      return `${requestMethod} ${new URL(this.buildUrl(connection, path)).pathname}`;
    } catch {
      return `${requestMethod} ${path.split('?')[0]}`;
    }
  }

  private async responseErrorDetail(response: Response, secret: string | null) {
    try {
      const raw = (await response.text()).trim();
      if (!raw || /^\s*</.test(raw)) return '';
      let detail = raw;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const value = parsed as Record<string, unknown>;
          const candidate =
            value.message ??
            value.detail ??
            value.error_message ??
            (typeof value.error === 'string' ? value.error : undefined);
          if (typeof candidate === 'string') detail = candidate;
        }
      } catch {
        // 非 JSON 文本仍可作为供应商错误摘要。
      }
      const sanitized = secret ? detail.split(secret).join('***') : detail;
      return sanitized.replace(/\s+/g, ' ').slice(0, 300);
    } catch {
      return '';
    }
  }

  private async downloadSignedOutput(location: string, timeoutMs: number) {
    let url: URL;
    try {
      url = new URL(location);
    } catch {
      throw new BadGatewayException('Comfy Cloud 输出下载地址无效');
    }
    if (url.protocol !== 'https:') {
      throw new BadGatewayException('Comfy Cloud 输出下载地址不是 HTTPS');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
      });
      if (!response.ok) {
        throw new BadGatewayException(
          `Comfy Cloud 输出下载失败（HTTP ${response.status}）`,
        );
      }
      return response;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      if ((error as Error).name === 'AbortError') {
        throw new BadGatewayException('Comfy Cloud 输出下载超时');
      }
      throw new BadGatewayException('无法下载 Comfy Cloud 输出文件');
    } finally {
      clearTimeout(timer);
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
