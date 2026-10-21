import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { get } from 'node:https';
import { isIP } from 'node:net';
import { isPublicImageAddress } from '../common/ai/image-utils';

export const HOT_SOURCE_BYTE_LIMIT = 3 * 1024 * 1024;
export const HOT_SOURCE_TIMEOUT_MS = 20000;

/** Only controlled messages may reach task records; upstream URLs/tokens never do. */
export class HotTopicFetchError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HotTopicFetchError';
  }
}

export function safeHotTopicError(error: unknown): string {
  if (error instanceof HotTopicFetchError) return error.message;
  if (
    error !== null &&
    typeof error === 'object' &&
    'name' in error &&
    ['AbortError', 'TimeoutError'].includes(String(error.name))
  )
    return '请求超时或已取消，请稍后重试';
  return '网络连接或来源处理失败，请检查来源配置和服务状态';
}

/** Links are displayed, never implicitly fetched; reject credentials and local literals. */
export function normalizeHotTopicLink(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.port && !['80', '443'].includes(url.port)) ||
      !host.includes('.') ||
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.includes(':') ||
      (isIP(host) && !isPublicImageAddress(host))
    )
      return null;
    url.hash = '';
    const normalized = url.toString();
    return normalized.length <= 2048 ? normalized : null;
  } catch {
    return null;
  }
}

export async function resolveHotSourceTarget(
  value: string,
  signal: AbortSignal,
) {
  const normalized = normalizeHotTopicLink(value);
  if (!normalized || new URL(normalized).protocol !== 'https:')
    throw new HotTopicFetchError(
      'unsafe_url',
      '来源必须使用安全的公网 HTTPS 地址',
    );
  const url = new URL(normalized);
  if (url.port && url.port !== '443')
    throw new HotTopicFetchError('unsafe_url', '来源仅支持 HTTPS 默认端口');
  signal.throwIfAborted();
  // Race DNS against the same overall deadline; socket timeout alone does not cover DNS.
  const addresses = await new Promise<LookupAddress[]>((resolve, reject) => {
    const abort = () => reject(signal.reason as Error);
    signal.addEventListener('abort', abort, { once: true });
    lookup(url.hostname, { all: true, family: 4 }).then(
      (items) => {
        signal.removeEventListener('abort', abort);
        resolve(items);
      },
      () => {
        signal.removeEventListener('abort', abort);
        reject(new HotTopicFetchError('dns', '来源域名解析失败'));
      },
    );
  });
  signal.throwIfAborted();
  if (
    !Array.isArray(addresses) ||
    !addresses.length ||
    addresses.some((item) => !isPublicImageAddress(item.address))
  )
    throw new HotTopicFetchError(
      'unsafe_address',
      '来源地址不能指向内网、回环或保留网段',
    );
  return { url, address: addresses[0].address };
}

/** No cookies/browser automation, scripts, redirects or cross-origin credentials. */
export async function fetchHotSourceText(
  value: string,
  options: { signal: AbortSignal; bearerToken?: string | null },
): Promise<string> {
  const signal = AbortSignal.any([
    options.signal,
    AbortSignal.timeout(HOT_SOURCE_TIMEOUT_MS),
  ]);
  const target = await resolveHotSourceTarget(value, signal);
  if (options.bearerToken && /[\r\n]/.test(options.bearerToken))
    throw new HotTopicFetchError('invalid_token', '来源访问令牌格式无效');
  return new Promise((resolve, reject) => {
    const req = get(
      target.url,
      {
        signal,
        headers: {
          Accept:
            'application/json, application/rss+xml, application/atom+xml, text/html, application/xml, text/xml',
          'Accept-Encoding': 'identity',
          'User-Agent': 'FullstackSeed-HotTopics/1.0',
          ...(options.bearerToken
            ? { Authorization: `Bearer ${options.bearerToken}` }
            : {}),
        },
        lookup: (_host, options, callback) => {
          if (options.all)
            callback(null, [{ address: target.address, family: 4 }]);
          else callback(null, target.address, 4);
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status !== 200) {
          response.destroy();
          const message =
            status === 429
              ? '来源请求受到限流，请稍后重试'
              : [401, 403].includes(status)
                ? '来源拒绝访问，可能需要授权或人工验证'
                : status >= 300 && status < 400
                  ? '来源发生重定向，请配置最终 HTTPS 地址'
                  : `来源返回 HTTP ${status}`;
          reject(new HotTopicFetchError('http', message));
          return;
        }
        const mime = (response.headers['content-type'] ?? '').toLowerCase();
        if (mime && !/(json|xml|html|text\/plain)/.test(mime)) {
          response.destroy();
          reject(
            new HotTopicFetchError(
              'content_type',
              '来源未返回可解析的文本、JSON 或 RSS',
            ),
          );
          return;
        }
        if (
          response.headers['content-encoding'] &&
          response.headers['content-encoding'] !== 'identity'
        ) {
          response.destroy();
          reject(
            new HotTopicFetchError(
              'encoding',
              '来源返回压缩数据，当前采集器仅接受未压缩文本',
            ),
          );
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > HOT_SOURCE_BYTE_LIMIT) {
            req.destroy(
              new HotTopicFetchError('too_large', '来源响应超过 3 MB 限制'),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () =>
          resolve(Buffer.concat(chunks).toString('utf8')),
        );
        response.on('error', reject);
        response.on('aborted', () =>
          reject(
            new HotTopicFetchError(
              'incomplete',
              '来源响应中断，未获得完整数据',
            ),
          ),
        );
      },
    );
    req.on('error', reject);
  });
}
