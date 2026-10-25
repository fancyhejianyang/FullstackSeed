import { randomInt } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { modelBillingErrorMessage } from '../common/ai/model-provider-error';

export type AgentMediaKind = 'vision' | 'imageGeneration';
export interface AgentMediaProbeResult {
  providerId: number;
  model: string;
  kind: AgentMediaKind;
  status: 'valid' | 'invalid' | 'inconclusive';
  reason: string;
  message: string;
  checkedAt: string;
  cached: boolean;
}

/** 只信供应商明确的模型/能力拒绝；参数、端点、密钥和临时故障不能证明是非图片模型。 */
export function classifyMediaProbeError(
  status: number,
  value: unknown,
): Pick<AgentMediaProbeResult, 'status' | 'reason' | 'message'> {
  const billingMessage = modelBillingErrorMessage(value);
  if (billingMessage)
    return {
      status: 'inconclusive',
      reason: 'quota',
      message: `${billingMessage}无法确认图片能力，未移除候选。`,
    };
  const body = record(value);
  const error = record(body.error);
  const code = textField(error.code ?? body.code).slice(0, 200);
  const message = textField(error.message ?? body.message).slice(0, 2000);
  const detail = `${code} ${message}`;
  if (
    status === 401 ||
    /invalid.?api.?key|unauthorized|authentication|鉴权|密钥/i.test(detail)
  )
    return {
      status: 'inconclusive',
      reason: 'authentication',
      message: '账号鉴权失败，请检查密钥、地域和业务空间；未移除候选。',
    };
  if (/quota|balance|arrears|欠费|余额|额度/i.test(detail))
    return {
      status: 'inconclusive',
      reason: 'quota',
      message: '账号余额或额度异常，不能据此判断图片能力；未移除候选。',
    };
  if (status === 429 || /rate.?limit|throttl/i.test(detail))
    return {
      status: 'inconclusive',
      reason: 'rate_limit',
      message: '供应商限流，请稍后重试；未移除候选。',
    };
  if (status >= 500 || status === 408)
    return {
      status: 'inconclusive',
      reason: 'temporary',
      message: '供应商暂不可用，请稍后重试；未移除候选。',
    };
  if ([400, 403, 404, 422].includes(status)) {
    if (
      /model[._ -]?(not[._ -]?(found|exist)|does[._ -]?not[._ -]?exist)|invalid[._ -]?model[._ -]?id|模型不存在/i.test(
        detail,
      )
    )
      return {
        status: 'invalid',
        reason: 'model_unavailable',
        message:
          '供应商明确返回模型不存在或模型 ID 无效，已从当前候选移除；请修正大模型账号目录。',
      };
    if (
      /model.{0,60}(does not support|cannot accept|not support)\s+(image inputs?|image generation|vision|multimodal|images?\s*[.!;,]|images?$)|(?:image input|image content|image_url|vision input).{0,30}(not supported|unsupported|only supported).{0,30}models?|模型.{0,30}不支持\s*(图片输入|视觉|图像生成)|不支持.{0,20}(图片输入|视觉|图像生成).{0,20}模型/i.test(
        detail,
      )
    )
      return {
        status: 'invalid',
        reason: 'unsupported',
        message:
          '供应商明确表示该模型不支持此次图片能力，已从当前候选移除；请修正大模型账号目录。',
      };
  }
  return {
    status: 'inconclusive',
    reason: 'request_config',
    message: `测试未通过（HTTP ${status}），请检查模型权限、接口协议、参数和地域；不能据此认定为非图片模型，未移除候选。`,
  };
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textField(value: unknown): string {
  return typeof value === 'string'
    ? value
    : typeof value === 'number'
      ? String(value)
      : '';
}

function pngChunk(name: string, data: Buffer) {
  const source = Buffer.concat([Buffer.from(name), data]);
  let crc = 0xffffffff;
  for (const byte of source) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, source, checksum]);
}

/** 无外链、无业务资料的随机色块 PNG；文本问题不包含正确顺序，避免只回 OK 的假阳性。 */
export function createVisionChallenge() {
  const palette = [
    { name: 'red', rgb: [255, 0, 0] },
    { name: 'green', rgb: [0, 180, 0] },
    { name: 'blue', rgb: [0, 0, 255] },
    { name: 'yellow', rgb: [255, 255, 0] },
    { name: 'black', rgb: [0, 0, 0] },
    { name: 'white', rgb: [255, 255, 255] },
  ];
  const selected = Array.from(
    { length: 4 },
    () => palette.splice(randomInt(palette.length), 1)[0],
  );
  const width = 256,
    height = 64;
  const rows = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const offset = y * (width * 3 + 1) + 1 + x * 3;
      selected[Math.floor(x / 64)].rgb.forEach((v, i) => {
        rows[offset + i] = v;
      });
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const data = Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return {
    data,
    mimeType: 'image/png',
    question:
      'Read the four vertical color blocks in the attached image from left to right. Reply only JSON {"colors":[...]}, using the English names red, green, blue, yellow, black or white. Do not guess if the image is unavailable.',
    matches(answer: unknown) {
      if (typeof answer !== 'string') return false;
      try {
        const colors = record(
          JSON.parse(
            answer
              .trim()
              .replace(/^```(?:json)?\s*/i, '')
              .replace(/\s*```$/, ''),
          ),
        ).colors;
        return (
          Array.isArray(colors) &&
          colors.length === 4 &&
          colors.every(
            (value, i) =>
              typeof value === 'string' &&
              value.toLowerCase().trim() === selected[i].name,
          )
        );
      } catch {
        return false;
      }
    },
  };
}
