import { BadRequestException } from '@nestjs/common';
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : undefined;
}

export function imageGenerationRequest(
  model: string,
  content: string,
  protocol: 'openai' | 'dashscope',
  referenceImageDataUrl?: string,
) {
  if (referenceImageDataUrl && protocol !== 'dashscope') {
    throw new BadRequestException('图生图当前仅支持 DashScope 多模态生图协议');
  }
  return protocol === 'dashscope'
    ? {
        model,
        input: {
          messages: [
            {
              role: 'user',
              content: [
                ...(referenceImageDataUrl
                  ? [{ image: referenceImageDataUrl }]
                  : []),
                { text: content },
              ],
            },
          ],
        },
        parameters: {
          n: 1,
          ...(referenceImageDataUrl ? { prompt_extend: true } : {}),
        },
      }
    : { model, prompt: content, n: 1, size: '1024x1024' };
}

/** 只解析真实图片字段；绝不把模型回复中的 Markdown URL 当作生图回执。 */
export function generationResult(
  value: unknown,
  protocol: 'openai' | 'dashscope',
) {
  const body = record(value);
  const data =
    protocol === 'openai'
      ? record(first(body.data))
      : record(
          first(
            record(record(first(record(body.output).choices)).message).content,
          ),
        );
  if (typeof data.b64_json === 'string' && data.b64_json.length) {
    if (
      !/^[A-Za-z0-9+/]+={0,2}$/.test(data.b64_json) ||
      data.b64_json.length % 4 !== 0
    )
      throw new BadRequestException('生图响应包含无效 Base64');
    return { data: Buffer.from(data.b64_json, 'base64') };
  }
  const url = protocol === 'openai' ? data.url : data.image;
  if (typeof url === 'string' && url) return { url };
  throw new BadRequestException(
    '生图接口未返回图片，请检查模型与同步接口协议是否匹配（不支持异步任务接口）',
  );
}
