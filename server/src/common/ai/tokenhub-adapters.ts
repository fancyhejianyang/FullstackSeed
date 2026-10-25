import { BadRequestException } from '@nestjs/common';
import type {
  ModelFunction,
  ModelProtocol,
} from '../../model-endpoints/model-endpoint.constants';

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const first = (value: unknown) =>
  object(Array.isArray(value) ? value[0] : value);
const text = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;
function sourceUrl(value: unknown) {
  try {
    const url = new URL(String(value));
    return (
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export const EXTENDED_IMAGE_PROTOCOLS = [
  'tokenhubWandImage',
  'tokenhubKlingImage',
];
export const EXTENDED_VIDEO_PROTOCOLS = [
  'tokenhubWandVideo',
  'tokenhubPixverseVideo',
  'tokenhubKlingVideo',
  'tokenhubMinimaxVideo',
  'tokenhubMinimaxVideoV2',
];

export interface TokenhubInput {
  model: string;
  functionType: ModelFunction;
  protocol: ModelProtocol;
  prompt?: string;
  image?: string;
  lastImage?: string;
  references?: Array<{ type: string; url: string }>;
  resolution?: string;
  ratio?: string;
  duration?: number;
}

/** 新接口与业务调用共用构造；高级原生参数仍可在调试器中按官方文档修改。 */
export function extendedTokenhubRequest(
  input: TokenhubInput,
): Record<string, unknown> | null {
  const { model, functionType: scene, protocol } = input;
  const prompt = input.prompt ?? '蓝色小猫在阳光下轻轻转头，镜头平稳。';
  const image = input.image;
  const lastImage = input.lastImage;
  const refs = input.references ?? [];
  const ratio = input.ratio ?? '16:9';
  if (protocol === 'tokenhubWandImage')
    return {
      model,
      prompt,
      size: '1024x1024',
      ...(image
        ? { input: [{ content: [{ type: 'input_image', image_url: image }] }] }
        : {}),
    };
  if (protocol === 'tokenhubKlingImage') {
    const reference = image?.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '');
    return {
      model,
      prompt,
      n: 1,
      aspect_ratio: '1:1',
      resolution: '1k',
      ...(reference
        ? model === 'kling-image-v3'
          ? { image: reference }
          : { image_list: [reference] }
        : {}),
    };
  }
  if (protocol === 'tokenhubPixverseVideo')
    return {
      model,
      prompt,
      duration: input.duration ?? 5,
      quality: (input.resolution ?? '720P').toLowerCase(),
      ...(scene === 'textToVideo' || scene === 'referenceToVideo'
        ? { aspect_ratio: ratio === 'adaptive' ? '16:9' : ratio }
        : {}),
      ...(scene === 'imageToVideo'
        ? { img_id: image }
        : scene === 'startEndToVideo'
          ? { first_frame_img: image, last_frame_img: lastImage }
          : scene === 'referenceToVideo'
            ? {
                image_references: refs.map((item) => ({
                  img_id: item.url,
                  type: 'subject',
                })),
              }
            : {}),
    };
  if (protocol === 'tokenhubKlingVideo') {
    const omni =
      ['kling-video-v3-omni', 'kling-video-o1'].includes(model) ||
      ['omniVideo', 'referenceToVideo'].includes(scene);
    const settings = {
      resolution: (
        input.resolution ??
        (model === 'kling-video-v2.5-turbo' && scene === 'startEndToVideo'
          ? '1080P'
          : '720P')
      ).toLowerCase(),
      duration: input.duration ?? 5,
    };
    if (scene === 'textToVideo' && !omni)
      return {
        model,
        prompt,
        settings: {
          ...settings,
          aspect_ratio: ratio === 'adaptive' ? '16:9' : ratio,
        },
      };
    const contents: Record<string, unknown>[] = [
      { type: 'prompt', text: prompt },
    ];
    if (scene === 'motionControl')
      contents.push(
        { type: 'image', url: image },
        { type: 'video', url: 'REPLACE_WITH_MOTION_VIDEO_URL' },
      );
    else if (scene === 'omniVideo' || scene === 'referenceToVideo')
      contents.push(
        ...refs.map((item) => ({
          type:
            item.type === 'reference_video' ? 'feature_video' : 'refer_image',
          url: item.url,
        })),
      );
    else if (scene !== 'textToVideo') {
      contents.push({ type: 'first_frame', url: image });
      if (lastImage) contents.push({ type: 'last_frame', url: lastImage });
    }
    return {
      model,
      contents,
      settings: {
        ...settings,
        ...(omni
          ? { aspect_ratio: ratio === 'adaptive' ? '16:9' : ratio }
          : {}),
      },
    };
  }
  if (protocol === 'tokenhubMinimaxVideo')
    return {
      model,
      prompt,
      duration: input.duration ?? 6,
      resolution: input.resolution ?? '768P',
      ...(image ? { first_frame_image: image } : {}),
      ...(lastImage ? { last_frame_image: lastImage } : {}),
    };
  if (
    protocol === 'tokenhubWandVideo' ||
    protocol === 'tokenhubMinimaxVideoV2'
  ) {
    const resolution = input.resolution ?? '768P';
    const allowed =
      protocol === 'tokenhubWandVideo'
        ? ['768P', '1080P', '2K', '4K']
        : model === 'minimax-video-h3-max'
          ? ['480P', '768P']
          : ['768P', '2K'];
    if (!allowed.includes(resolution))
      throw new BadRequestException(
        `该视频协议支持的分辨率为 ${allowed.join('、')}，请调整后提交`,
      );
    const content: Record<string, unknown>[] = [{ type: 'text', text: prompt }];
    if (image)
      content.push({
        type: 'image_url',
        image_url: { url: image },
        role: 'first_frame',
      });
    if (lastImage)
      content.push({
        type: 'image_url',
        image_url: { url: lastImage },
        role: 'last_frame',
      });
    content.push(
      ...refs.map((item) => ({
        type: item.type === 'reference_video' ? 'video_url' : 'image_url',
        [item.type === 'reference_video' ? 'video_url' : 'image_url']: {
          url: item.url,
        },
        role: item.type,
      })),
    );
    return { model, content, resolution, duration: input.duration ?? 5, ratio };
  }
  if (protocol === 'tokenhub3d') {
    if (scene === 'textTo3d')
      return {
        model,
        prompt: '一只简洁的卡通小猫',
        ...(model.startsWith('rodin') ? { tier: 'Gen-2.5-Low' } : {}),
      };
    if (scene === 'imageTo3d')
      return model.startsWith('tripo')
        ? { model, input: image }
        : model.startsWith('rodin')
          ? { model, images: [image], tier: 'Gen-2.5-Low' }
          : { model, image_url: image };
    if (scene === 'threeDFormat' && model === 'hy-3d-format')
      return {
        model,
        file: { url: 'REPLACE_WITH_3D_FILE_URL' },
        format: 'GLB',
      };
    if (
      ['threeDComponent', 'threeDUv', 'threeDRigging'].includes(scene) &&
      model.startsWith('hy-')
    )
      return { model, file: { url: 'REPLACE_WITH_3D_FILE_URL' } };
    if (scene === 'threeDRetopology' && model === 'hy-3d-retopology')
      return { model, file_3d: { url: 'REPLACE_WITH_3D_FILE_URL' } };
    if (scene === 'threeDTexture' && model === 'hy-3d-texture')
      return {
        model,
        file_3d: { url: 'REPLACE_WITH_3D_FILE_URL' },
        image: { url: image ?? 'REPLACE_WITH_IMAGE_URL' },
      };
    if (
      ['threeDRiggingCheck', 'threeDRigging', 'threeDFormat'].includes(scene) &&
      model.startsWith('tripo')
    )
      return {
        model,
        input: 'REPLACE_WITH_3D_FILE_URL',
        ...(scene === 'threeDFormat' ? { format: 'GLB' } : {}),
      };
    return {
      model,
      REPLACE_WITH_PARAMETERS_FROM_DOCUMENTATION:
        '请按本卡片官方调用文档填写输入文件、多视图或动作参数后移除此项',
    };
  }
  if (
    protocol === 'tokenhubYoutuVideo' ||
    protocol === 'tokenhubWorldScene' ||
    protocol === 'tokenhubWorldPanorama'
  )
    return {
      model,
      REPLACE_WITH_PARAMETERS_FROM_DOCUMENTATION:
        '请按本卡片官方文档填写所需图片或音视频输入后移除此项',
    };
  if (protocol === 'tokenhubAsrSync' || protocol === 'tokenhubAsrAsync')
    return { model, input_url: 'REPLACE_WITH_AUDIO_OR_VIDEO_URL' };
  if (protocol === 'tokenhubTts')
    return {
      model,
      text: '你好，这是一条语音接口测试。',
      voice_setting: { voice_id: 'REPLACE_WITH_VOICE_ID' },
      output_format: 'url',
      stream: false,
    };
  if (protocol === 'tokenhubVoiceClone')
    return {
      model,
      audio_url: 'REPLACE_WITH_AUDIO_URL',
      tts_model: 'minimax-speech-2.8-hd',
      text: '你好，这是一条试听测试。',
      output_format: 'url',
    };
  if (protocol === 'tokenhubVoiceDesign')
    return {
      model,
      prompt: '清晰自然的青年普通话讲解音色',
      preview_text: '你好，欢迎试听这条测试语音。',
      output_format: 'url',
    };
  if (protocol === 'tokenhubDubbing')
    return {
      model,
      input_url: 'REPLACE_WITH_VIDEO_URL',
      src_language: 'zh',
      dst_language: 'en',
    };
  if (protocol === 'tokenhubMusic')
    return {
      model,
      prompt: '舒缓的钢琴，温暖宁静的午后',
      ...(scene === 'instrumentalGeneration'
        ? { is_instrumental: true }
        : { lyrics_optimizer: true }),
      output_format: 'url',
    };
  if (protocol === 'tokenhubMurekaMusic')
    return {
      model,
      prompt: '温暖舒缓的流行音乐',
      n: 1,
      ...(scene === 'musicGeneration'
        ? {
            lyrics:
              '[Verse]\n阳光穿过窗边的树叶\n微风吹散了昨日的疲倦\n[Chorus]\n带着希望向明天出发',
          }
        : {}),
    };
  if (protocol === 'tokenhubMultimodalEmbedding')
    return {
      model,
      input: [{ type: 'text', text: '模型接口测试' }],
      encoding_format: 'float',
    };
  if (protocol === 'openaiResponses')
    return {
      model,
      input: '请搜索今天的科技新闻，给出一条结果和来源链接。',
      tools: [{ type: 'web_search' }],
      stream: false,
    };
  if (protocol === 'openaiChatSearch')
    return {
      model,
      messages: [
        {
          role: 'user',
          content: '请搜索今天的科技新闻，给出一条结果和来源链接。',
        },
      ],
      web_search_options: { enable: true, search_source: 'lite' },
      stream: false,
    };
  return null;
}

export interface TokenhubResult {
  status: 'pending' | 'succeeded' | 'failed' | 'unknown';
  taskId?: string;
  url?: string;
  message?: string;
}
function phase(status: unknown): TokenhubResult['status'] {
  const value = String(status).toLowerCase();
  if (['succeeded', 'succeed', 'completed', 'success'].includes(value))
    return 'succeeded';
  if (
    [
      'failed',
      'fail',
      'cancelled',
      'canceled',
      'incomplete',
      'timeouted',
    ].includes(value)
  )
    return 'failed';
  if (
    [
      'queued',
      'queueing',
      'created',
      'submitted',
      'pending',
      'running',
      'processing',
      'in_progress',
      'preparing',
      'streaming',
      'reviewing',
    ].includes(value)
  )
    return 'pending';
  return 'unknown';
}

/** 严格按已核对的协议字段归一化，不能把 HTTP 200 或任意字符串当成功。 */
export function extendedTokenhubResult(
  value: unknown,
  protocol: ModelProtocol,
  submitting = false,
): TokenhubResult | null {
  const body = object(value),
    data = object(body.data),
    firstData = first(body.data);
  if (
    ![
      'tokenhubWandImage',
      'tokenhubKlingImage',
      ...EXTENDED_VIDEO_PROTOCOLS,
      'tokenhub3d',
      'tokenhubYoutuVideo',
      'tokenhubWorldScene',
      'tokenhubWorldPanorama',
      'tokenhubAsrSync',
      'tokenhubAsrAsync',
      'tokenhubTts',
      'tokenhubVoiceClone',
      'tokenhubVoiceDesign',
      'tokenhubDubbing',
      'tokenhubMusic',
      'tokenhubMurekaMusic',
      'openaiResponses',
      'openaiChatSearch',
    ].includes(protocol)
  )
    return null;
  if (
    body.error ||
    phase(body.status) === 'failed' ||
    (body.code !== undefined && body.code !== 0 && body.code !== '0') ||
    (object(body.base_resp).status_code !== undefined &&
      object(body.base_resp).status_code !== 0)
  )
    return { status: 'failed' };
  let status: unknown = body.status;
  let taskId = text(body.task_id) ?? text(body.id);
  let url: string | undefined;
  if (protocol === 'tokenhubWandImage') url = text(firstData.url);
  else if (protocol === 'tokenhubKlingImage') {
    status = data.task_status;
    taskId = text(data.task_id);
    url =
      text(first(object(data.task_result).images).url) ??
      text(first(object(data.task_result).series_images).url);
  } else if (protocol === 'tokenhubWandVideo')
    url = text(object(body.content).video_url);
  else if (protocol === 'tokenhubPixverseVideo') {
    const resp = object(body.Resp);
    taskId =
      typeof resp.video_id === 'number'
        ? String(resp.video_id)
        : text(resp.video_id);
    status =
      resp.status === 1
        ? 'succeeded'
        : resp.status === 5
          ? 'running'
          : [6, 7, 8].includes(Number(resp.status))
            ? 'failed'
            : undefined;
    url = text(resp.url);
  } else if (protocol === 'tokenhubKlingVideo') {
    taskId = text(data.id) ?? text(firstData.id);
    status = data.status ?? firstData.status;
    url = text(first(firstData.outputs).url);
  } else if (protocol === 'tokenhubMinimaxVideo')
    url = text(object(body.content).url);
  else if (protocol === 'tokenhubMinimaxVideoV2') {
    const task = object(body.task);
    status = task.status;
    taskId = text(body.task_id) ?? text(task.id);
    url = text(object(task.content).url);
  } else if (protocol === 'tokenhubYoutuVideo') url = text(data.url);
  else if (protocol === 'tokenhubWorldScene') url = text(firstData.scene_url);
  else if (protocol === 'tokenhubWorldPanorama')
    url = text(firstData.super_resolution_image_url);
  else if (protocol === 'tokenhub3d') {
    const output = body.output ?? body.data;
    const nonempty = Array.isArray(output)
      ? output.length > 0
      : output && typeof output === 'object' && Object.keys(output).length > 0;
    const state = phase(status);
    return {
      status:
        state === 'succeeded' && !nonempty
          ? 'unknown'
          : submitting && taskId && state === 'unknown'
            ? 'pending'
            : state,
      taskId,
    };
  } else if (
    protocol === 'tokenhubAsrSync' ||
    protocol === 'tokenhubAsrAsync'
  ) {
    const output = object(body.output);
    const hasOutput =
      !!text(output.text) ||
      !!text(output.subtitle_url) ||
      (Array.isArray(output.sentences) && output.sentences.length > 0);
    const state = phase(status);
    return {
      status: state === 'succeeded' && !hasOutput ? 'unknown' : state,
      taskId,
    };
  } else if (protocol === 'tokenhubDubbing')
    url = text(object(body.output).result_url);
  else if (protocol === 'tokenhubTts' || protocol === 'tokenhubMusic') {
    const audio = text(data.audio);
    const complete = data.status === 2;
    return {
      status: complete && audio ? 'succeeded' : 'unknown',
      ...(audio?.startsWith('https://') ? { url: audio } : {}),
    };
  } else if (
    protocol === 'tokenhubVoiceClone' ||
    protocol === 'tokenhubVoiceDesign'
  )
    return { status: text(body.voice_id) ? 'succeeded' : 'unknown' };
  else if (protocol === 'tokenhubMurekaMusic')
    url = text(first(body.choices).url);
  else if (protocol === 'openaiChatSearch') {
    const message = object(first(body.choices).message);
    return {
      status:
        text(message.content) &&
        Array.isArray(message.search_results) &&
        message.search_results.some((source) => sourceUrl(object(source).url))
          ? 'succeeded'
          : 'unknown',
      message: '联网测试需要返回回答及搜索来源；没有来源时无法确认实际检索。',
    };
  } else if (protocol === 'openaiResponses') {
    const outputs = Array.isArray(body.output) ? body.output.map(object) : [];
    const hasText =
      !!text(body.output_text) ||
      outputs.some(
        (item) =>
          item.type === 'message' &&
          Array.isArray(item.content) &&
          item.content.some((part) => !!text(object(part).text)),
      );
    const hasSearch =
      outputs.some(
        (item) =>
          item.type === 'web_search_call' && item.status === 'completed',
      ) ||
      outputs.some(
        (item) =>
          Array.isArray(item.content) &&
          item.content.some(
            (part) =>
              Array.isArray(object(part).annotations) &&
              (object(part).annotations as unknown[]).some(
                (note) =>
                  object(note).type === 'url_citation' &&
                  sourceUrl(object(note).url),
              ),
          ),
      );
    return {
      status: hasText && hasSearch ? 'succeeded' : 'unknown',
      message: '联网测试需要返回回答及可核验的搜索调用或来源。',
    };
  }
  const result = phase(status);
  return {
    status:
      result === 'succeeded' && !url
        ? 'unknown'
        : submitting && taskId && result === 'unknown'
          ? 'pending'
          : result,
    taskId,
    url,
  };
}
