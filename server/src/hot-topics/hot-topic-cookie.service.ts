import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { HotTopicFetchError } from './hot-topic-network';

export const HOT_SOURCE_COOKIE_FILE_BYTE_LIMIT = 64 * 1024;
export const HOT_SOURCE_COOKIE_HEADER_BYTE_LIMIT = 32 * 1024;
const COOKIE_ROW_LIMIT = 500;
const ENCRYPTED_BYTE_LIMIT = 256 * 1024;
const TARGET_HOST = 'www.douyin.com';
const TARGET_PATH = '/aweme/v1/web/hot/search/list/';
const AAD = Buffer.from('FullstackSeed:hot-topic-source:douyin-cookie:v1');
const CONFIGURATION_ERROR =
  '请管理员配置 HOT_SOURCE_COOKIE_ENCRYPTION_KEY（32 字节随机密钥的 Base64），再保存或使用抖音 Cookie';
const INVALID_FILE =
  'Cookie 文件格式无效，请上传浏览器导出的 UTF-8 Netscape cookies.txt 文件';
const COOKIE_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
// RFC 6265 cookie-octet: exclude whitespace, controls, quotes, comma,
// semicolon, backslash and non-ASCII data before constructing an HTTP header.
const COOKIE_VALUE = /^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$/;

interface StoredCookie {
  name: string;
  value: string;
  expiresAt: number;
}

function invalidFile(): never {
  throw new BadRequestException(INVALID_FILE);
}

function usableCookies(cookies: StoredCookie[], now: number): StoredCookie[] {
  return cookies.filter(
    (cookie) => cookie.expiresAt === 0 || cookie.expiresAt > now,
  );
}

function headerFor(cookies: StoredCookie[]): string {
  const header = cookies.map((item) => `${item.name}=${item.value}`).join('; ');
  if (
    !header ||
    Buffer.byteLength(header, 'utf8') > HOT_SOURCE_COOKIE_HEADER_BYTE_LIMIT
  )
    throw new BadRequestException(
      header
        ? '抖音 Cookie 超过 32 KB 限制，请重新导出仅含抖音站点的 Cookie'
        : '文件中没有可用于抖音热搜接口的有效 Cookie，可能已过期，请重新登录后导出',
    );
  return header;
}

function parseCookieFile(fileName: string, content: string): StoredCookie[] {
  if (
    typeof fileName !== 'string' ||
    fileName.length > 255 ||
    !/^[^\\/\r\n\0]+\.txt$/i.test(fileName) ||
    typeof content !== 'string' ||
    !content ||
    Buffer.byteLength(content, 'utf8') > HOT_SOURCE_COOKIE_FILE_BYTE_LIMIT ||
    /[\0\uFFFD]/.test(content)
  )
    invalidFile();
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  // Bound total lines as well as cookie records, including malicious comment-only files.
  if (lines.length > COOKIE_ROW_LIMIT + 50) invalidFile();
  const cookies: Array<StoredCookie & { pathLength: number }> = [];
  let records = 0;
  const now = Math.floor(Date.now() / 1000);
  for (const raw of lines) {
    if (!raw || (raw.startsWith('#') && !raw.startsWith('#HttpOnly_')))
      continue;
    const line = raw.replace(/^#HttpOnly_/, '');
    if (++records > COOKIE_ROW_LIMIT) invalidFile();
    const fields = line.split('\t');
    if (fields.length !== 7) invalidFile();
    const [
      domainField,
      includeSubdomains,
      path,
      secure,
      expiration,
      name,
      value,
    ] = fields;
    // Some browser exporters emit empty-name entries. They are not HTTP cookies.
    if (!name) continue;
    if (
      !COOKIE_NAME.test(name) ||
      !COOKIE_VALUE.test(value) ||
      !['TRUE', 'FALSE'].includes(includeSubdomains) ||
      !['TRUE', 'FALSE'].includes(secure) ||
      !/^\d+$/.test(expiration) ||
      !Number.isSafeInteger(Number(expiration)) ||
      !/^(?:\.)?[a-z0-9]+(?:[.-][a-z0-9]+)*$/i.test(domainField) ||
      !path.startsWith('/') ||
      [...path].some((character) => {
        const code = character.charCodeAt(0);
        return code <= 32 || code === 127;
      })
    )
      invalidFile();
    const domain = domainField.replace(/^\./, '').toLowerCase();
    // Never accept parent suffixes such as .com, sibling sites or subdomains.
    const domainMatches =
      domain === TARGET_HOST ||
      (domain === 'douyin.com' && includeSubdomains === 'TRUE');
    const pathMatches =
      TARGET_PATH === path ||
      (TARGET_PATH.startsWith(path) &&
        (path.endsWith('/') || TARGET_PATH[path.length] === '/'));
    const expiresAt = Number(expiration);
    if (!domainMatches || !pathMatches || (expiresAt !== 0 && expiresAt <= now))
      continue;
    cookies.push({ name, value, expiresAt, pathLength: path.length });
  }
  const result = cookies
    .sort((left, right) => right.pathLength - left.pathLength)
    .map(({ name, value, expiresAt }) => ({ name, value, expiresAt }));
  headerFor(result);
  return result;
}

function readStoredCookies(value: unknown): StoredCookie[] {
  if (!Array.isArray(value) || value.length > COOKIE_ROW_LIMIT) invalidFile();
  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) invalidFile();
    const record = item as Record<string, unknown>;
    if (
      typeof record.name !== 'string' ||
      typeof record.value !== 'string' ||
      !COOKIE_NAME.test(record.name) ||
      !COOKIE_VALUE.test(record.value) ||
      !Number.isSafeInteger(record.expiresAt) ||
      (record.expiresAt as number) < 0
    )
      invalidFile();
    return {
      name: record.name,
      value: record.value,
      expiresAt: record.expiresAt as number,
    };
  });
}

/** A write-only credential, never an upload attachment or a public response field. */
@Injectable()
export class HotTopicCookieService {
  constructor(private readonly config: ConfigService) {}

  private encryptionKey(): Buffer {
    const encoded = this.config.get<string>('HOT_SOURCE_COOKIE_ENCRYPTION_KEY');
    if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(encoded))
      throw new BadRequestException(CONFIGURATION_ERROR);
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32 || key.toString('base64') !== encoded)
      throw new BadRequestException(CONFIGURATION_ERROR);
    return key;
  }

  encryptFile(fileName: string, content: string): string {
    const cookies = parseCookieFile(fileName, content);
    const key = this.encryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(cookies), 'utf8'),
      cipher.final(),
    ]);
    return ['v1', iv, cipher.getAuthTag(), ciphertext]
      .map((part) =>
        typeof part === 'string' ? part : part.toString('base64'),
      )
      .join('.');
  }

  cookieHeader(encrypted: string): string {
    let key: Buffer;
    try {
      key = this.encryptionKey();
    } catch {
      throw new HotTopicFetchError('cookie_key', CONFIGURATION_ERROR);
    }
    let cookies: StoredCookie[];
    try {
      if (
        typeof encrypted !== 'string' ||
        encrypted.length > ENCRYPTED_BYTE_LIMIT
      )
        throw new Error();
      const [version, ivText, tagText, dataText, extra] = encrypted.split('.');
      if (
        version !== 'v1' ||
        extra !== undefined ||
        !ivText ||
        !tagText ||
        !dataText
      )
        throw new Error();
      const parts = [ivText, tagText, dataText].map((part) => {
        const decoded = Buffer.from(part, 'base64');
        if (decoded.toString('base64') !== part) throw new Error();
        return decoded;
      });
      const [iv, tag, ciphertext] = parts;
      if (iv.length !== 12 || tag.length !== 16) throw new Error();
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(AAD);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
      cookies = readStoredCookies(JSON.parse(plaintext) as unknown);
    } catch {
      throw new HotTopicFetchError(
        'cookie_unreadable',
        '抖音 Cookie 无法解密或配置已损坏，请重新上传 Cookie 文件；如更换过加密密钥，请联系管理员',
      );
    }
    try {
      return headerFor(usableCookies(cookies, Math.floor(Date.now() / 1000)));
    } catch {
      throw new HotTopicFetchError(
        'cookie_expired',
        '抖音 Cookie 已过期或不可用，请重新登录抖音并上传新的 Cookie 文件',
      );
    }
  }
}
