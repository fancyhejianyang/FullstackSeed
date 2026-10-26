import { lookup } from 'node:dns/promises';
import { EventEmitter } from 'node:events';
import { get, type RequestOptions } from 'node:https';
import type { IncomingMessage } from 'node:http';
import {
  fetchHotSourceText,
  normalizeHotTopicLink,
  resolveHotSourceTarget,
  safeHotTopicError,
} from './hot-topic-network';
import { DOUYIN_HOT_URL } from './hot-topic.types';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('node:https', () => ({ get: jest.fn() }));
const dns = lookup as jest.Mock;
const httpGet = get as jest.Mock;
describe('hot topic SSRF and error boundaries', () => {
  beforeEach(() => dns.mockReset());
  it.each([
    'http://localhost/a',
    'https://127.0.0.1/a',
    'https://10.0.0.1/a',
    'https://169.254.169.254/a',
    'https://[::1]/a',
    'file:///etc/passwd',
    'https://user:pass@news.example.com/a',
    'https://news.example.com:8443/a',
  ])('rejects unsafe URL %s', (url) => {
    expect(normalizeHotTopicLink(url)).toBeNull();
  });
  it('does not permit HTTP fetching or DNS results containing even one private IP', async () => {
    await expect(
      resolveHotSourceTarget(
        'http://news.example.com',
        new AbortController().signal,
      ),
    ).rejects.toThrow('HTTPS');
    expect(dns).not.toHaveBeenCalled();
    dns.mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    await expect(
      resolveHotSourceTarget(
        'https://news.example.com',
        new AbortController().signal,
      ),
    ).rejects.toThrow('内网');
  });
  it('returns only a validated pinned public address and respects cancellation', async () => {
    dns.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    const result = await resolveHotSourceTarget(
      'https://news.example.com',
      new AbortController().signal,
    );
    expect(result.address).toBe('8.8.8.8');
    const controller = new AbortController();
    controller.abort();
    await expect(
      resolveHotSourceTarget('https://news.example.com', controller.signal),
    ).rejects.toThrow();
    expect(dns).toHaveBeenCalledTimes(1);
  });
  it('does not leak arbitrary network errors, token or addresses into task error text', () => {
    expect(
      safeHotTopicError(
        new Error('Authorization Bearer secret https://example.com/?key=123'),
      ),
    ).not.toContain('secret');
    expect(
      safeHotTopicError(new DOMException('key=secret', 'TimeoutError')),
    ).toBe('请求超时或已取消，请稍后重试');
  });
});

describe('fixed Douyin credential boundary', () => {
  beforeEach(() => {
    dns.mockReset().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    httpGet.mockReset();
  });
  function respond(statusCode = 200, body = '{"data":{"word_list":[]}}') {
    httpGet.mockImplementation(
      (
        _url: URL,
        _options: RequestOptions,
        callback: (res: IncomingMessage) => void,
      ) => {
        const request = new EventEmitter();
        const response = Object.assign(new EventEmitter(), {
          statusCode,
          headers: {
            'content-type': 'application/json',
            location: 'https://other.example.com/',
          },
          destroy: jest.fn(),
        });
        queueMicrotask(() => {
          callback(response as unknown as IncomingMessage);
          if (statusCode === 200) {
            response.emit('data', Buffer.from(body));
            response.emit('end');
          }
        });
        return request;
      },
    );
  }
  it('sends a validated Cookie only to the exact fixed URL using the existing DNS pinning', async () => {
    respond();
    const cookie = 'sessionid=private-test; csrf_token=abc%3D';
    await fetchHotSourceText(DOUYIN_HOT_URL, {
      signal: new AbortController().signal,
      douyinCookie: cookie,
    });
    expect(httpGet).toHaveBeenCalledTimes(1);
    const [url, options] = httpGet.mock.calls[0] as [URL, RequestOptions];
    expect(url.href).toBe(DOUYIN_HOT_URL);
    expect(options.headers).toMatchObject({ Cookie: cookie });
    expect(options.lookup).toBeDefined();
  });
  it.each([
    'https://www.douyin.com/aweme/v1/web/hot/search/list/?x=1',
    'https://www.douyin.com/aweme/v1/web/hot/search/list/#fragment',
    'https://www.douyin.com/hot',
    'https://weibo.com/ajax/side/hotSearch',
    'https://www.douyin.com.evil.example.com/aweme/v1/web/hot/search/list/',
  ])('rejects credential target %s before DNS or network', async (url) => {
    await expect(
      fetchHotSourceText(url, {
        signal: new AbortController().signal,
        douyinCookie: 'sessionid=private-test',
      }),
    ).rejects.toThrow('目标地址');
    expect(dns).not.toHaveBeenCalled();
    expect(httpGet).not.toHaveBeenCalled();
  });
  it.each([
    '',
    'name=value\r\nX-Leak: secret',
    'bad name=value',
    'name=has space',
    'name=值',
    'name="quoted"',
    'name=comma,value',
    'name=back\\slash',
    'name=' + 'x'.repeat(32 * 1024),
  ])(
    'rejects malformed or oversized credentials without leaking values',
    async (cookie) => {
      const result = fetchHotSourceText(DOUYIN_HOT_URL, {
        signal: new AbortController().signal,
        douyinCookie: cookie,
      });
      await expect(result).rejects.toThrow('Cookie 无效');
      expect(httpGet).not.toHaveBeenCalled();
    },
  );
  it('does not attach credentials to ordinary platform requests', async () => {
    respond();
    await fetchHotSourceText('https://weibo.com/ajax/side/hotSearch', {
      signal: new AbortController().signal,
    });
    const [, options] = httpGet.mock.calls[0] as [URL, RequestOptions];
    expect(options.headers).not.toHaveProperty('Cookie');
  });
  it('rejects redirects without a second request or forwarding Cookie', async () => {
    respond(302);
    await expect(
      fetchHotSourceText(DOUYIN_HOT_URL, {
        signal: new AbortController().signal,
        douyinCookie: 'sessionid=private-test',
      }),
    ).rejects.toThrow('重定向');
    expect(httpGet).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403])(
    'gives a credential update hint for Douyin HTTP %i',
    async (status) => {
      respond(status);
      await expect(
        fetchHotSourceText(DOUYIN_HOT_URL, {
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow('上传或更新 Cookie 文件');
    },
  );
  it('keeps throttling and pre-cancellation semantics', async () => {
    respond(429);
    await expect(
      fetchHotSourceText(DOUYIN_HOT_URL, {
        signal: new AbortController().signal,
        douyinCookie: 'sessionid=private-test',
      }),
    ).rejects.toThrow('限流');
    httpGet.mockClear();
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchHotSourceText(DOUYIN_HOT_URL, {
        signal: controller.signal,
        douyinCookie: 'sessionid=private-test',
      }),
    ).rejects.toBe(controller.signal.reason);
    expect(httpGet).not.toHaveBeenCalled();
  });
});
