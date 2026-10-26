import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COOKIE_FILE_BYTE_LIMIT,
  readCookieFile,
  validateCookieFile,
} from './cookieFile.ts';

const sample =
  '# Netscape HTTP Cookie File\n#HttpOnly_.douyin.com\tTRUE\t/\tTRUE\t0\tsession\ttest-only';
const file = (content, name = 'cookies.txt') => {
  const bytes = new TextEncoder().encode(content);
  return {
    name,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer,
  };
};

test('仅选择 .txt，限制非空与 64 KB，本地校验不读取文件', () => {
  assert.equal(validateCookieFile(file(sample)), '');
  assert.equal(validateCookieFile(file(sample, 'COOKIES.TXT')), '');
  assert.match(validateCookieFile(file(sample, 'cookies.json')), /\.txt/);
  assert.match(validateCookieFile(file('')), /不能为空/);
  assert.match(
    validateCookieFile({
      name: 'cookies.txt',
      size: COOKIE_FILE_BYTE_LIMIT + 1,
    }),
    /64 KB/,
  );
});

test('保存时读取 UTF-8 Netscape 文件，保留 HttpOnly 行供后端验证', async () => {
  assert.equal(await readCookieFile(file(sample)), sample);
  await assert.rejects(
    readCookieFile(file('session=not-netscape')),
    /Netscape/,
  );
  await assert.rejects(
    readCookieFile({
      name: 'cookies.txt',
      size: 1,
      arrayBuffer: async () => new Uint8Array([0xff]).buffer,
    }),
    /UTF-8/,
  );
});

test('读取失败不输出底层错误或 Cookie 内容', async () => {
  await assert.rejects(
    readCookieFile({
      name: 'cookies.txt',
      size: 10,
      arrayBuffer: async () => {
        throw new Error('secret-session-content');
      },
    }),
    (error) => {
      assert.match(error.message, /读取失败/);
      assert.doesNotMatch(error.message, /secret-session/);
      return true;
    },
  );
});
