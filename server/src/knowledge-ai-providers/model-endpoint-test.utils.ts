import { imageGenerationRequest } from '../common/ai/image-generation';
import { videoGenerationRequest } from '../common/ai/video-generation';
import { mediaProtocol } from '../model-endpoints/model-endpoint.constants';
import type { ModelEndpoint } from '../model-endpoints/entities/model-endpoint.entity';

export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function endpointTestTemplate(
  card: Pick<ModelEndpoint, 'modelCode' | 'functionType' | 'protocol'>,
) {
  const model = card.modelCode;
  const scene = card.functionType;
  const image = 'REPLACE_WITH_IMAGE_URL';
  if (scene === 'chat')
    return {
      model,
      messages: [{ role: 'user', content: '请仅回复：接口测试成功。' }],
      max_tokens: 128,
      stream: false,
    };
  if (scene === 'vision')
    return {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '请简要描述这张图片。' },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ],
      max_tokens: 256,
      stream: false,
    };
  if (scene === 'embedding') return { model, input: ['模型接口测试'] };
  if (scene === 'textToImage' || scene === 'imageToImage')
    return imageGenerationRequest(
      model,
      '白色背景上的蓝色圆形，简洁插画，无文字。',
      mediaProtocol(card.protocol),
      scene === 'imageToImage' ? image : undefined,
    );
  if (scene === 'startEndToVideo')
    return {
      model,
      prompt: '镜头平稳地从首帧过渡到尾帧。',
      images: [image, 'REPLACE_WITH_LAST_FRAME_URL'],
      resolution: '720p',
      duration: 5,
    };
  return videoGenerationRequest(
    {
      model,
      prompt: '镜头缓缓移动，画面中的云朵轻轻飘动。',
      generationMode: scene,
      referenceImageDataUrl: scene === 'imageToVideo' ? image : undefined,
      referenceMedia:
        scene === 'referenceToVideo'
          ? [{ type: 'reference_image', url: image }]
          : undefined,
      resolution: '720P',
      ratio: '16:9',
      duration: 5,
    },
    mediaProtocol(card.protocol),
  );
}

/** 有界脱敏，供应商原始响应可能回显凭据或包含大图片/向量。 */
export function endpointTestResponse(
  value: unknown,
  secretKey: string,
): string {
  const clean = (input: unknown, depth: number, key = ''): unknown => {
    if (/authorization|api[-_]?key|secret|access[-_]?token|password/i.test(key))
      return '[已隐藏]';
    if (key === 'b64_json') return '[图片 Base64 已省略]';
    if (depth > 6) return '[内容已省略]';
    if (typeof input === 'string') {
      const safe = (
        secretKey ? input.split(secretKey).join('[已隐藏]') : input
      ).replace(/Bearer\s+[^\s"<>]+/gi, 'Bearer [已隐藏]');
      return safe.length > 2000 ? safe.slice(0, 2000) + '…[已截断]' : safe;
    }
    if (Array.isArray(input))
      return input.slice(0, 12).map((item) => clean(item, depth + 1));
    if (input && typeof input === 'object')
      return Object.fromEntries(
        Object.entries(input)
          .slice(0, 50)
          .map(([name, item]) => [name, clean(item, depth + 1, name)]),
      );
    return input;
  };
  const output = JSON.stringify(clean(value, 0), null, 2);
  return (secretKey ? output.split(secretKey).join('[已隐藏]') : output).slice(
    0,
    32768,
  );
}
