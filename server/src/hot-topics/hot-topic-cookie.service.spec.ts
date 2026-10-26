import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HotTopicFetchError } from './hot-topic-network';
import {
  HOT_SOURCE_COOKIE_FILE_BYTE_LIMIT,
  HotTopicCookieService,
} from './hot-topic-cookie.service';

const NOW = 1800000000000;
const KEY = Buffer.alloc(32, 1).toString('base64');
function service(key: unknown = KEY) {
  return new HotTopicCookieService({
    get: () => key,
  } as unknown as ConfigService);
}
function row(
  overrides: Partial<{
    domain: string;
    includeSubdomains: string;
    path: string;
    secure: string;
    expiresAt: string;
    name: string;
    value: string;
  }> = {},
) {
  const values = {
    domain: '.douyin.com',
    includeSubdomains: 'TRUE',
    path: '/',
    secure: 'TRUE',
    expiresAt: '0',
    name: 'test_session',
    value: 'test-only-secret',
    ...overrides,
  };
  return Object.values(values).join('\t');
}
function file(...rows: string[]) {
  return ['# Netscape HTTP Cookie File', ...rows].join('\r\n');
}

describe('Douyin write-only Cookie file encryption (offline)', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  it('accepts Netscape HttpOnly/session cookies and never embeds the original file or secret in ciphertext', () => {
    const subject = service();
    const input = file(`#HttpOnly_${row()}`);
    const encrypted = subject.encryptFile('www.douyin.com_cookies.txt', input);
    expect(encrypted.startsWith('v1.')).toBe(true);
    expect(encrypted).not.toContain('test-only-secret');
    expect(encrypted).not.toContain('Netscape');
    expect(subject.cookieHeader(encrypted)).toBe(
      'test_session=test-only-secret',
    );
    expect(subject.encryptFile('cookies.txt', input)).not.toBe(encrypted);
  });

  it('keeps only fixed Douyin endpoint cookies and orders longer paths first', () => {
    const subject = service();
    const encrypted = subject.encryptFile(
      'cookies.txt',
      file(
        row({ name: 'root' }),
        row({
          domain: 'www.douyin.com',
          includeSubdomains: 'FALSE',
          name: 'host',
        }),
        row({ path: '/aweme/v1', name: 'path' }),
        row({ domain: 'weibo.com', name: 'other' }),
        row({ domain: '.com', name: 'suffix' }),
        row({ domain: 'evil.douyin.com', name: 'sibling' }),
        row({
          domain: 'douyin.com',
          includeSubdomains: 'FALSE',
          name: 'hostonly',
        }),
        row({ path: '/aweme/v1/web/hot/search/list/extra', name: 'child' }),
        row({ path: '/awem', name: 'badboundary' }),
        row({ name: '' }),
      ),
    );
    expect(subject.cookieHeader(encrypted)).toBe(
      'path=test-only-secret; root=test-only-secret; host=test-only-secret',
    );
  });

  it('filters expired cookies at upload and reevaluates expiry when used later', () => {
    const subject = service();
    const encrypted = subject.encryptFile(
      'cookies.txt',
      file(
        row({ name: 'old', expiresAt: String(NOW / 1000 - 1) }),
        row({ name: 'future', expiresAt: String(NOW / 1000 + 2) }),
      ),
    );
    expect(subject.cookieHeader(encrypted)).toBe('future=test-only-secret');
    jest.spyOn(Date, 'now').mockReturnValue(NOW + 3000);
    expect(() => subject.cookieHeader(encrypted)).toThrow(/已过期/);
  });

  it.each([
    ['cookie.json', file(row())],
    ['../cookies.txt', file(row())],
    ['cookies.txt', 'test_session=secret'],
    ['cookies.txt', file(row({ value: 'secret; injected=x' }))],
    ['cookies.txt', file(row({ value: 'secret\r\nX-Injected: value' }))],
    ['cookies.txt', file(row({ name: 'secret:header' }))],
    ['cookies.txt', file(row({ expiresAt: '-1' }))],
    ['cookies.txt', file(row({ expiresAt: '9007199254740993' }))],
    ['cookies.txt', file(row({ secure: 'maybe' }))],
    ['cookies.txt', file(row({ value: '\uFFFD' }))],
    ['cookies.txt', '#'.repeat(HOT_SOURCE_COOKIE_FILE_BYTE_LIMIT + 1)],
    ['cookies.txt', file(...Array.from({ length: 501 }, () => row()))],
    ['cookies.txt', file(row({ value: 'x'.repeat(33000) }))],
    ['cookies.txt', file(row({ domain: 'example.com' }))],
  ])(
    'rejects invalid/unsafe/unusable file %s without reflecting secrets',
    (name, content) => {
      expect(() => service().encryptFile(name, content)).toThrow(
        BadRequestException,
      );
      try {
        service().encryptFile(name, content);
      } catch (error) {
        expect(String(error)).not.toContain('test-only-secret');
        expect(String(error)).not.toContain('X-Injected');
      }
    },
  );

  it('accepts BOM UTF-8 exports and both secure/non-secure cookies for the HTTPS target', () => {
    const subject = service();
    const encrypted = subject.encryptFile(
      'COOKIES.TXT',
      `\uFEFF${file(row({ secure: 'FALSE' }))}`,
    );
    expect(subject.cookieHeader(encrypted)).toBe(
      'test_session=test-only-secret',
    );
  });

  it.each([
    undefined,
    '',
    'not-base64',
    Buffer.alloc(16).toString('base64'),
    `${KEY} `,
  ])(
    'requires a separate configured 32-byte key and never falls back to a default',
    (key) => {
      const subject = service(key === undefined ? null : key);
      expect(() => subject.encryptFile('cookies.txt', file(row()))).toThrow(
        /HOT_SOURCE_COOKIE_ENCRYPTION_KEY/,
      );
      expect(() => subject.cookieHeader('v1.invalid')).toThrow(
        HotTopicFetchError,
      );
    },
  );

  it('rejects tampered ciphertext and wrong encryption keys with controlled errors', () => {
    const subject = service();
    const encrypted = subject.encryptFile('cookies.txt', file(row()));
    const parts = encrypted.split('.');
    const changed = Buffer.from(parts[3], 'base64');
    changed[0] ^= 1;
    parts[3] = changed.toString('base64');
    for (const [reader, value] of [
      [subject, parts.join('.')],
      [service(Buffer.alloc(32, 2).toString('base64')), encrypted],
      [subject, 'test-only-secret'],
      [subject, 'v1.AAAA.AAAA.AAAA.extra'],
    ] as const) {
      expect(() => reader.cookieHeader(value)).toThrow(/无法解密/);
      try {
        reader.cookieHeader(value);
      } catch (error) {
        expect(String(error)).not.toContain('test-only-secret');
        expect(String(error)).not.toContain('authenticate');
      }
    }
  });
});
