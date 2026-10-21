import { lookup } from 'node:dns/promises';
import {
  normalizeHotTopicLink,
  resolveHotSourceTarget,
  safeHotTopicError,
} from './hot-topic-network';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
const dns = lookup as jest.Mock;
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
