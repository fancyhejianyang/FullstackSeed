import { BadRequestException } from '@nestjs/common';
import type { MediaProtocol } from '../../model-endpoints/model-endpoint.constants';
import { readMediaJson } from './image-utils';
import {
  modelBillingErrorMessage,
  readModelProviderError,
} from './model-provider-error';
import { setTimeout as wait } from 'node:timers/promises';
import {
  EXTENDED_IMAGE_PROTOCOLS,
  extendedTokenhubRequest,
  extendedTokenhubResult,
} from './tokenhub-adapters';
import type { ModelProtocol } from '../../model-endpoints/model-endpoint.constants';
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
  protocol: MediaProtocol,
  referenceImageDataUrl?: string,
) {
  if (EXTENDED_IMAGE_PROTOCOLS.includes(protocol))
    return extendedTokenhubRequest({
      model,
      protocol: protocol as ModelProtocol,
      functionType: referenceImageDataUrl ? 'imageToImage' : 'textToImage',
      prompt: content,
      image: referenceImageDataUrl,
    })!;
  if (protocol === 'tokenhubHunyuanImageChat')
    return {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: content },
            ...(referenceImageDataUrl
              ? [
                  {
                    type: 'image_url',
                    image_url: { url: referenceImageDataUrl },
                  },
                ]
              : []),
          ],
        },
      ],
    };
  if (
    [
      'tokenhubHunyuanImage',
      'tokenhubSeedreamImage',
      'tokenhubViduImage',
    ].includes(protocol)
  ) {
    const maxLength =
      protocol === 'tokenhubSeedreamImage'
        ? 600
        : protocol === 'tokenhubViduImage'
          ? 2000
          : 8192;
    if (Array.from(content).length > maxLength)
      throw new BadRequestException(
        `当前生图协议提示词不能超过 ${maxLength} 字符`,
      );
    return {
      model,
      prompt: content,
      ...(referenceImageDataUrl ? { images: [referenceImageDataUrl] } : {}),
      ...(protocol === 'tokenhubSeedreamImage'
        ? { size: '2048x2048' }
        : protocol === 'tokenhubHunyuanImage'
          ? { size: '1024x1024' }
          : {}),
    };
  }
  if (!['openai', 'dashscope'].includes(protocol))
    throw new BadRequestException('所选协议不支持图片生成');
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
export function generationResult(value: unknown, protocol: MediaProtocol) {
  const billingMessage = modelBillingErrorMessage(value);
  if (billingMessage) throw new BadRequestException(billingMessage);
  if (EXTENDED_IMAGE_PROTOCOLS.includes(protocol)) {
    const result = extendedTokenhubResult(value, protocol as ModelProtocol);
    if (result?.status === 'succeeded' && result.url)
      return { url: result.url };
    throw new BadRequestException('图片任务未成功或缺少真实图片结果');
  }
  const body = record(value);
  if (body.error)
    throw new BadRequestException('图片生成失败，请检查输入内容和账号配置');
  if (protocol === 'tokenhubHunyuanImageChat') {
    const url = record(record(record(first(body.choices)).delta).image).url;
    if (typeof url === 'string' && url) return { url };
    throw new BadRequestException('混元 3.5 未返回最终图片');
  }
  if (protocol === 'tokenhubViduImage') {
    const url = record(first(body.creations)).url;
    if (body.state === 'success' && typeof url === 'string' && url)
      return { url };
    throw new BadRequestException('Vidu 生图尚未成功或未返回图片');
  }
  const usesData = [
    'openai',
    'tokenhubHunyuanImage',
    'tokenhubSeedreamImage',
  ].includes(protocol);
  const data = usesData
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
  const url = usesData ? data.url : data.image;
  if (typeof url === 'string' && url) return { url };
  throw new BadRequestException(
    '生图接口未返回图片，请检查模型与同步接口协议是否匹配（不支持异步任务接口）',
  );
}

/** 仅轮询已受理的 Vidu 任务，绝不自动重新提交生成请求。 */
export async function imageGenerationResult(
  value: unknown,
  target: {
    protocol: MediaProtocol;
    url: string;
    taskUrlTemplate?: string | null;
    secretKey: string;
  },
  signal: AbortSignal,
  onTask?: (taskId: string) => Promise<unknown>,
) {
  const billingMessage = modelBillingErrorMessage(value);
  if (billingMessage) throw new BadRequestException(billingMessage);
  if (
    target.protocol !== 'tokenhubViduImage' &&
    !EXTENDED_IMAGE_PROTOCOLS.includes(target.protocol)
  )
    return generationResult(value, target.protocol);
  if (EXTENDED_IMAGE_PROTOCOLS.includes(target.protocol)) {
    let body: unknown = value;
    const initial = extendedTokenhubResult(
      body,
      target.protocol as ModelProtocol,
      true,
    );
    if (initial?.status === 'succeeded')
      return generationResult(body, target.protocol);
    if (initial?.status === 'failed')
      throw new BadRequestException('图片任务失败，不会重新提交');
    const id = initial?.taskId;
    if (!id || id.length > 256 || !target.taskUrlTemplate)
      throw new BadRequestException('生图任务缺少有效编号或查询路径');
    const taskUrl = target.taskUrlTemplate.replace(
      '{taskId}',
      encodeURIComponent(id),
    );
    if (new URL(taskUrl).origin !== new URL(target.url).origin)
      throw new BadRequestException('生图查询地址必须与生成接口同域');
    await onTask?.(id);
    let submitting = true;
    for (;;) {
      signal.throwIfAborted();
      const billingMessage = modelBillingErrorMessage(body);
      if (billingMessage) throw new BadRequestException(billingMessage);
      const state = extendedTokenhubResult(
        body,
        target.protocol as ModelProtocol,
        submitting,
      );
      if (state?.status === 'succeeded')
        return generationResult(body, target.protocol);
      if (state?.status !== 'pending')
        throw new BadRequestException(
          '图片任务失败或返回无法识别的状态，不会重新提交',
        );
      await wait(3000, undefined, { signal });
      const response = await fetch(taskUrl, {
        method: 'GET',
        redirect: 'error',
        signal,
        headers: { Authorization: `Bearer ${target.secretKey}` },
      });
      if (!response.ok) {
        const billingMessage = modelBillingErrorMessage(
          await readModelProviderError(response),
        );
        throw new BadRequestException(
          billingMessage ??
            `图片查询失败（HTTP ${response.status}），不会重新提交`,
        );
      }
      body = await readMediaJson(response);
      submitting = false;
    }
  }
  let body = record(value);
  if (body.state === 'success') return generationResult(body, target.protocol);
  const id = body.task_id;
  if (
    typeof id !== 'string' ||
    !id.trim() ||
    id.length > 256 ||
    !target.taskUrlTemplate
  )
    throw new BadRequestException(
      'Vidu 生图未返回有效任务编号或未配置任务查询路径',
    );
  const taskUrl = target.taskUrlTemplate.replace(
    '{taskId}',
    encodeURIComponent(id),
  );
  if (new URL(taskUrl).origin !== new URL(target.url).origin)
    throw new BadRequestException('生图查询地址必须与生成接口同域');
  await onTask?.(id);
  for (;;) {
    signal.throwIfAborted();
    const billingMessage = modelBillingErrorMessage(body);
    if (billingMessage) throw new BadRequestException(billingMessage);
    if (body.state === 'success')
      return generationResult(body, target.protocol);
    if (body.state === 'failed' || body.error)
      throw new BadRequestException('Vidu 图片生成失败');
    if (!['created', 'queueing', 'processing'].includes(String(body.state)))
      throw new BadRequestException('Vidu 生图返回无法识别的任务状态');
    await wait(3000, undefined, { signal });
    const response = await fetch(taskUrl, {
      method: 'GET',
      redirect: 'error',
      signal,
      headers: { Authorization: `Bearer ${target.secretKey}` },
    });
    if (!response.ok) {
      const billingMessage = modelBillingErrorMessage(
        await readModelProviderError(response),
      );
      throw new BadRequestException(
        billingMessage ??
          `生图任务查询失败（HTTP ${response.status}），不会重新提交生成任务`,
      );
    }
    body = record(await readMediaJson(response));
  }
}
