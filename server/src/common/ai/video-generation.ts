import { BadRequestException } from '@nestjs/common';
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

export function videoGenerationRequest(payload: {
  model: string;
  prompt: string;
  generationMode: AiMaterialGenerationMode;
  referenceImageDataUrl?: string;
  referenceMedia?: AiMaterialReferenceMedia[];
  resolution: AiMaterialVideoResolution;
  ratio: AiMaterialVideoRatio;
  duration: AiMaterialVideoDuration;
}) {
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

export function videoTaskId(value: unknown) {
  const taskId = record(record(value).output).task_id;
  if (typeof taskId === 'string' && taskId.trim()) return taskId.trim();
  throw new BadRequestException('视频生成接口未返回任务编号');
}

export function videoTaskResult(value: unknown): {
  status: 'pending' | 'succeeded' | 'failed';
  videoUrl?: string;
  errorMessage?: string;
} {
  const body = record(value);
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
