import { BadRequestException } from '@nestjs/common';
import type { MediaProtocol } from '../../model-endpoints/model-endpoint.constants';
import type {
  AiMaterialGenerationMode,
  AiMaterialReferenceMedia,
  AiMaterialVideoDuration,
  AiMaterialVideoRatio,
  AiMaterialVideoResolution,
} from '../../ai-materials/ai-material.constants';

const WAN_VIDEO_PROMPT_MAX_LENGTH = 20000;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function videoGenerationRequest(
  payload: {
    model: string;
    prompt: string;
    generationMode: AiMaterialGenerationMode;
    referenceImageDataUrl?: string;
    referenceMedia?: AiMaterialReferenceMedia[];
    resolution: AiMaterialVideoResolution;
    ratio: AiMaterialVideoRatio;
    duration: AiMaterialVideoDuration;
  },
  protocol: MediaProtocol = 'dashscope',
) {
  if (
    payload.generationMode === 'imageToVideo' &&
    !payload.referenceImageDataUrl
  )
    throw new BadRequestException('图生视频缺少首帧参考图片');
  if (
    payload.generationMode === 'referenceToVideo' &&
    !payload.referenceMedia?.length
  )
    throw new BadRequestException('多参考生视频缺少参考素材');
  if (protocol === 'tokenhubHunyuanVideo' || protocol === 'tokenhubViduVideo') {
    if (protocol === 'tokenhubHunyuanVideo') {
      if (!['textToVideo', 'imageToVideo'].includes(payload.generationMode))
        throw new BadRequestException('混元视频协议不支持此功能场景');
      if (payload.duration !== 5 && payload.duration !== -1)
        throw new BadRequestException('当前混元视频模型仅支持 5 秒');
      if (payload.resolution !== '720P')
        throw new BadRequestException('当前混元视频模型仅支持 720P');
      return {
        model: payload.model,
        prompt: payload.prompt,
        duration: 5,
        resolution: '720p',
        ...(payload.referenceImageDataUrl
          ? { image: payload.referenceImageDataUrl }
          : payload.ratio !== 'adaptive'
            ? { aspect_ratio: payload.ratio }
            : {}),
      };
    }
    const promptLimit =
      payload.generationMode === 'referenceToVideo' ? 2000 : 5000;
    if (Array.from(payload.prompt).length > promptLimit)
      throw new BadRequestException(
        `Vidu 当前场景提示词不能超过 ${promptLimit} 字符`,
      );
    const media = payload.referenceMedia ?? [];
    const images = media
      .filter((item) => item.type === 'reference_image')
      .map((item) => item.url);
    const videos = media
      .filter((item) => item.type === 'reference_video')
      .map((item) => item.url);
    if (videos.length && payload.model !== 'vidu-video-q2-pro')
      throw new BadRequestException('当前 Vidu 模型不支持视频参考素材');
    return {
      model: payload.model,
      prompt: payload.prompt,
      ...(payload.generationMode === 'referenceToVideo'
        ? {
            ...(images.length ? { images } : {}),
            ...(videos.length ? { videos } : {}),
          }
        : payload.referenceImageDataUrl
          ? { images: [payload.referenceImageDataUrl] }
          : {}),
      resolution: payload.resolution.toLowerCase(),
      ...(payload.duration === -1 ? {} : { duration: payload.duration }),
      ...(payload.generationMode === 'textToVideo' &&
      payload.ratio !== 'adaptive'
        ? { aspect_ratio: payload.ratio }
        : {}),
    };
  }
  if (protocol !== 'dashscope')
    throw new BadRequestException('所选协议不支持视频生成');
  return {
    model: payload.model,
    input: {
      prompt: payload.prompt.slice(0, WAN_VIDEO_PROMPT_MAX_LENGTH),
      ...(payload.generationMode === 'referenceToVideo'
        ? { media: payload.referenceMedia }
        : payload.referenceImageDataUrl
          ? {
              media: [
                { type: 'first_frame', url: payload.referenceImageDataUrl },
              ],
            }
          : {}),
    },
    parameters: {
      resolution: payload.resolution,
      ratio: payload.ratio,
      duration: payload.duration,
      prompt_extend: true,
    },
  };
}

export function videoTaskId(
  value: unknown,
  protocol: MediaProtocol = 'dashscope',
) {
  const taskId =
    protocol === 'dashscope'
      ? record(record(value).output).task_id
      : record(value).task_id;
  if (typeof taskId === 'string' && taskId.trim()) return taskId.trim();
  throw new BadRequestException('视频生成接口未返回任务编号');
}

export function videoTaskResult(
  value: unknown,
  protocol: MediaProtocol = 'dashscope',
): {
  status: 'pending' | 'succeeded' | 'failed';
  videoUrl?: string;
  errorMessage?: string;
} {
  const body = record(value);
  if (protocol === 'tokenhubHunyuanVideo' || protocol === 'tokenhubViduVideo') {
    const status =
      protocol === 'tokenhubHunyuanVideo' ? body.status : body.state;
    if (
      ['queued', 'running', 'created', 'queueing', 'processing'].includes(
        String(status),
      )
    )
      return { status: 'pending' };
    if (['succeeded', 'success'].includes(String(status))) {
      const results =
        protocol === 'tokenhubHunyuanVideo' ? body.videos : body.creations;
      const url = Array.isArray(results) ? record(results[0]).url : undefined;
      if (typeof url === 'string' && url.trim())
        return { status: 'succeeded', videoUrl: url.trim() };
      throw new BadRequestException('视频任务完成但未返回视频地址');
    }
    if (status === 'failed')
      return {
        status: 'failed',
        errorMessage: '供应商视频任务失败，请核对输入参数和模型权限',
      };
    throw new BadRequestException('视频任务返回了无法识别的状态');
  }
  const output = record(body.output);
  const status =
    typeof output.task_status === 'string'
      ? output.task_status.toUpperCase()
      : '';
  if (status === 'PENDING' || status === 'RUNNING')
    return { status: 'pending' };
  if (status === 'SUCCEEDED') {
    const result = Array.isArray(output.results)
      ? record(output.results[0])
      : record(output.results);
    const videoUrl = output.video_url ?? result.video_url ?? result.url;
    if (typeof videoUrl === 'string' && videoUrl.trim())
      return { status: 'succeeded', videoUrl: videoUrl.trim() };
    throw new BadRequestException('视频任务完成但未返回视频地址');
  }
  if (['FAILED', 'CANCELED', 'UNKNOWN'].includes(status)) {
    const message = [output.message, body.message, output.code, body.code]
      .find((item) => typeof item === 'string' && item.trim())
      ?.toString()
      .trim();
    return {
      status: 'failed',
      errorMessage: message?.slice(0, 120) || `供应商任务状态为 ${status}`,
    };
  }
  throw new BadRequestException('视频任务返回了无法识别的状态');
}
