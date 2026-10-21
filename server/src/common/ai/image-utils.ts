import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { get } from 'node:https';
import { BlockList, isIPv4 } from 'node:net';

export const IMAGE_UPLOAD_LIMIT = 5 * 1024 * 1024;
export const IMAGE_LIMIT = 10 * 1024 * 1024;
export const VIDEO_LIMIT = 250 * 1024 * 1024;

export function imageMime(data: Buffer, limit = IMAGE_LIMIT): string {
  if (!data.length || data.length > limit)
    throw new BadRequestException(
      `图片为空或超过 ${limit / 1024 / 1024} MB 限制`,
    );
  if (
    data.length >= 24 &&
    data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
  )
    return 'image/png';
  if (
    data.length >= 4 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  )
    return 'image/jpeg';
  if (
    data.length >= 16 &&
    data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  throw new BadRequestException(
    '仅支持 PNG、JPEG、WebP 图片，不支持 SVG 或非图片文件',
  );
}

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(address, prefix, 'ipv4');

export function isPublicImageAddress(address: string) {
  // 保守限制为公网 IPv4，拒绝 IPv6 映射和私网，避免解析歧义。
  return isIPv4(address) && !blocked.check(address, 'ipv4');
}

/** URL 来自供应商而非浏览器；仍防 SSRF、重定向和 DNS 重绑定，不转发账号密钥。 */
async function downloadGeneratedMedia(
  value: string,
  signal: AbortSignal,
  options: { kind: '图片' | '视频'; limit: number; timeoutMs: number },
): Promise<Buffer> {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  )
    throw new BadRequestException(`供应商返回的${options.kind}地址不安全`);
  signal.throwIfAborted();
  const addresses = await lookup(url.hostname, { all: true, family: 4 });
  signal.throwIfAborted();
  if (
    !addresses.length ||
    addresses.some(({ address }) => !isPublicImageAddress(address))
  )
    throw new BadRequestException(`${options.kind}地址必须解析到公网 IPv4`);
  const pinned = addresses[0].address;
  return new Promise((resolve, reject) => {
    const req = get(
      url,
      {
        signal,
        // 将校验后的 IP 固定给连接；保留原始 Host/SNI/TLS 校验。
        lookup: (_host, options, callback) => {
          if (options.all) callback(null, [{ address: pinned, family: 4 }]);
          else callback(null, pinned, 4);
        },
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.destroy();
          reject(
            new BadRequestException(
              `生成${options.kind}下载失败（不跟随重定向）`,
            ),
          );
          return;
        }
        const chunks: Buffer[] = [];
        let length = 0;
        response.on('data', (chunk: Buffer) => {
          length += chunk.length;
          if (length > options.limit) {
            req.destroy(
              new BadRequestException(
                `生成${options.kind}超过 ${Math.round(options.limit / 1024 / 1024)} MB`,
              ),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      },
    );
    req.setTimeout(options.timeoutMs, () =>
      req.destroy(new Error(`生成${options.kind}下载超时`)),
    );
    req.on('error', reject);
  });
}

export function downloadGeneratedImage(value: string, signal: AbortSignal) {
  return downloadGeneratedMedia(value, signal, {
    kind: '图片',
    limit: IMAGE_LIMIT,
    timeoutMs: 30000,
  });
}

export function downloadGeneratedVideo(value: string, signal: AbortSignal) {
  return downloadGeneratedMedia(value, signal, {
    kind: '视频',
    limit: VIDEO_LIMIT,
    timeoutMs: 120000,
  });
}

export function videoMime(data: Buffer): 'video/mp4' {
  if (!data.length || data.length > VIDEO_LIMIT)
    throw new BadRequestException('视频为空或超过 250 MB 限制');
  if (data.length >= 12 && data.toString('ascii', 4, 8) === 'ftyp')
    return 'video/mp4';
  throw new BadRequestException('当前仅支持供应商返回 MP4 视频');
}

/** 限制模型 JSON 响应大小，避免无界读取 Base64。 */
export async function readMediaJson(
  response: Response,
  maxBytes = 16 * 1024 * 1024,
): Promise<unknown> {
  if (!response.body) throw new BadRequestException('模型响应为空');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes)
        throw new BadRequestException(
          `模型响应超过 ${Math.ceil(maxBytes / 1024 / 1024)} MB`,
        );
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally {
    await reader.cancel();
  }
}
