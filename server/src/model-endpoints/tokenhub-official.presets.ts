import type { CreateModelEndpointDto } from './dto/model-endpoint.dto';
import {
  PROTOCOLS,
  type ModelFunction,
  type ModelProtocol,
} from './model-endpoint.constants';

export type OfficialModelEndpointPreset = CreateModelEndpointDto;
/** 人工核对官网详细调用指南的快照；不在运行时抓网页或猜接口。2026-10-25 */
export const TOKENHUB_OFFICIAL_PRESETS: OfficialModelEndpointPreset[] = [];
export const TOKENHUB_DOCUMENTATION: Record<string, string> = {};
const keys = new Set<string>();
function add(
  models: string[],
  scenes: ModelFunction[],
  protocol: ModelProtocol,
  apiPath: string,
  documentId: number,
  taskApiPath = '',
) {
  for (const modelCode of models)
    for (const functionType of scenes) {
      const key = `${modelCode}:${functionType}`;
      if (keys.has(key)) throw new Error(`重复官方接口：${key}`);
      keys.add(key);
      TOKENHUB_DOCUMENTATION[key] =
        `https://cloud.tencent.com/document/product/1823/${documentId}`;
      TOKENHUB_OFFICIAL_PRESETS.push({
        platformType: 'tencentTokenhub',
        modelCode,
        modelName: modelCode,
        functionType,
        protocol,
        apiPath,
        taskApiPath,
        executionMode: PROTOCOLS[protocol].mode,
        isActive: true,
      });
    }
}
const languageModels = [
  'hy4-preview',
  'hy3',
  'hy-mt2-pro',
  'hy-mt2-plus',
  'hy-mt2-lite',
  'hunyuan-role-latest',
  'hy-role',
  'deepseek/deepseek-flash',
  'deepseek-v4-flash-202605',
  'deepseek/deepseek-v4-flash-0731',
  'deepseek/deepseek-v4-flash',
  'deepseek-v4-pro-202606',
  'deepseek/deepseek-v4-pro-0813',
  'deepseek/deepseek-v4-pro',
  'deepseek/deepseek-v4-flash-vision-exp',
  'deepseek-v4.1-flash-1017',
  'deepseek-v4.1-flash',
  'deepseek-v4-flash-0731',
  'deepseek-v4-pro-0813',
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'glm-5.3-flash',
  'glm-5.3-flashx',
  'glm-5.3',
  'glm-5.2',
  'glm-5v-turbo',
  'kimi-k2.7-code-highspeed',
  'kimi-k3.1-pro-highspeed',
  'kimi-k3.1-pro',
  'kimi-k3',
  'kimi-k2.8-preview',
  'kimi-k2.7-code',
  'kimi-k2.6',
  'minimax-m3.1-flash',
  'minimax-m3',
  'minimax-m2.7',
  'mimo-v2.6-pro',
  'mimo-v2.6-flash',
  'mimo-v2.5-pro',
  'step-5-preview',
];
add(languageModels, ['chat'], 'openaiChat', '/v1/chat/completions', 130079);
const visualLanguageModels = [
  'deepseek/deepseek-flash',
  'deepseek-v4-flash-202605',
  'deepseek/deepseek-v4-flash-0731',
  'deepseek/deepseek-v4-flash',
  'deepseek/deepseek-v4-flash-vision-exp',
  'deepseek-v4.1-flash-1017',
  'deepseek-v4.1-flash',
  'glm-5.3-flash',
  'glm-5.3-flashx',
  'glm-5v-turbo',
  'kimi-k2.7-code-highspeed',
  'kimi-k3.1-pro-highspeed',
  'kimi-k3.1-pro',
  'kimi-k3',
  'kimi-k2.8-preview',
  'kimi-k2.7-code',
  'kimi-k2.6',
  'minimax-m3.1-flash',
  'minimax-m3',
  'mimo-v2.6-pro',
  'mimo-v2.6-flash',
  'step-5-preview',
];
add(
  [
    ...visualLanguageModels,
    'youtu-vita',
    'hy-vision-2.0-instruct',
    'hunyuan-t1-vision-20250916',
  ],
  ['vision'],
  'openaiChat',
  '/v1/chat/completions',
  136956,
);
add(
  visualLanguageModels.filter((code) => !code.startsWith('deepseek')),
  ['videoUnderstanding'],
  'openaiChat',
  '/v1/chat/completions',
  136957,
);
add(
  ['youtu-vita', 'hunyuan-turbos-vision-video-20250728'],
  ['videoUnderstanding'],
  'openaiChat',
  '/v1/chat/completions',
  136957,
);
add(
  ['kinfra-text-embedding-0.6b', 'kinfra-text-embedding-4b'],
  ['embedding'],
  'openaiEmbedding',
  '/v1/embeddings',
  133515,
);
add(
  ['kinfra-vl-embedding-2b', 'kinfra-vl-embedding-8b'],
  ['multimodalEmbedding'],
  'tokenhubMultimodalEmbedding',
  '/v1/embeddings/multimodal',
  133515,
);
add(
  ['hy-image-v3'],
  ['textToImage', 'imageToImage'],
  'tokenhubHunyuanImage',
  '/v1/wand/hunyuan-image/v3-generation',
  135745,
);
add(
  ['hy-image-v3.5-preview'],
  ['textToImage', 'imageToImage'],
  'tokenhubHunyuanImageChat',
  '/v1/wand/hunyuan-image/v35-generation',
  135745,
);
add(
  [
    'seedream-image-v5.0-pro',
    'seedream-image-v5.0-lite',
    'seedream-image-v5.0-flash',
  ],
  ['textToImage', 'imageToImage'],
  'tokenhubSeedreamImage',
  '/v1/wand/si-image/generation',
  136609,
);
add(
  ['vidu-image-q2'],
  ['textToImage', 'imageToImage'],
  'tokenhubViduImage',
  '/v1/wand/vidu-image/generation',
  135746,
  '/v1/wand/vidu-image/tasks/{taskId}',
);
add(
  [
    'wand-vega-image-lite',
    'wand-vega-image-flash',
    'wand-vega-image-pro',
    'wand-vega-image-1.5-pro',
  ],
  ['textToImage', 'imageToImage'],
  'tokenhubWandImage',
  '/v1/wand/vega-images/generations',
  137203,
  '/v1/wand/vega-images/tasks/{taskId}',
);
add(
  ['kling-image-v3', 'kling-image-o1', 'kling-image-v3-omni'],
  ['textToImage', 'imageToImage'],
  'tokenhubKlingImage',
  '/v1/wand/kling-image/generation',
  138803,
  '/v1/wand/kling-image/tasks/{taskId}',
);

add(
  ['hy-video-v1.5'],
  ['textToVideo', 'imageToVideo'],
  'tokenhubHunyuanVideo',
  '/v1/wand/hunyuan-video/generation',
  137202,
  '/v1/wand/hunyuan-video/tasks/{taskId}',
);
const videoScenePaths: Partial<Record<ModelFunction, string>> = {
  textToVideo: 'text-to-video',
  imageToVideo: 'image-to-video',
  referenceToVideo: 'reference-to-video',
  startEndToVideo: 'start-end-to-video',
};
for (const [model, scenes] of [
  ['vidu-video-q4-preview', ['imageToVideo', 'referenceToVideo']],
  [
    'vidu-video-q3-turbo',
    ['textToVideo', 'imageToVideo', 'referenceToVideo', 'startEndToVideo'],
  ],
  ['vidu-video-q3-pro', ['textToVideo', 'imageToVideo', 'startEndToVideo']],
  ['vidu-video-q3', ['referenceToVideo']],
  ['vidu-video-q2', ['textToVideo', 'referenceToVideo']],
  [
    'vidu-video-q2-pro',
    ['imageToVideo', 'referenceToVideo', 'startEndToVideo'],
  ],
  ['vidu-video-q2-turbo', ['imageToVideo', 'startEndToVideo']],
] as Array<[string, ModelFunction[]]>)
  for (const scene of scenes)
    add(
      [model],
      [scene],
      'tokenhubViduVideo',
      `/v1/wand/vidu/${videoScenePaths[scene]}`,
      135756,
      '/v1/wand/vidu/tasks/{taskId}',
    );
for (const scene of [
  'textToVideo',
  'imageToVideo',
  'referenceToVideo',
  'startEndToVideo',
] as const)
  add(
    ['pixverse-video-v6.0', 'pixverse-video-c1', 'pixverse-video-v5.6'],
    [scene],
    'tokenhubPixverseVideo',
    `/v1/wand/pixverse/${videoScenePaths[scene]}`,
    135325,
    '/v1/wand/pixverse/tasks/{taskId}',
  );
add(
  ['wand-vega-video-1.0-lite'],
  ['textToVideo', 'imageToVideo', 'referenceToVideo', 'startEndToVideo'],
  'tokenhubWandVideo',
  '/v1/wand/vega-videos/tasks',
  138195,
  '/v1/wand/vega-videos/tasks/{taskId}',
);
add(
  [
    'kling-video-v4',
    'kling-video-v3',
    'kling-video-v3-turbo',
    'kling-video-v2.6',
    'kling-video-v2.5-turbo',
  ],
  ['textToVideo'],
  'tokenhubKlingVideo',
  '/v1/wand/kling/text-to-video',
  135742,
  '/v1/wand/kling/tasks/{taskId}',
);
add(
  [
    'kling-video-v4',
    'kling-video-v3',
    'kling-video-v3-turbo',
    'kling-video-v2.6',
    'kling-video-v2.5-turbo',
  ],
  ['imageToVideo'],
  'tokenhubKlingVideo',
  '/v1/wand/kling/image-to-video',
  135742,
  '/v1/wand/kling/tasks/{taskId}',
);
add(
  [
    'kling-video-v4',
    'kling-video-v3',
    'kling-video-v2.6',
    'kling-video-v2.5-turbo',
  ],
  ['startEndToVideo'],
  'tokenhubKlingVideo',
  '/v1/wand/kling/image-to-video',
  135742,
  '/v1/wand/kling/tasks/{taskId}',
);
add(
  ['kling-video-v4', 'kling-video-v3-omni', 'kling-video-o1'],
  ['omniVideo', 'referenceToVideo'],
  'tokenhubKlingVideo',
  '/v1/wand/kling/omni-video',
  135742,
  '/v1/wand/kling/tasks/{taskId}',
);
add(
  ['kling-video-v3-omni', 'kling-video-o1'],
  ['textToVideo', 'imageToVideo', 'startEndToVideo'],
  'tokenhubKlingVideo',
  '/v1/wand/kling/omni-video',
  135742,
  '/v1/wand/kling/tasks/{taskId}',
);
add(
  ['kling-video-motion-control-v3.0', 'kling-video-motion-control-v2.6'],
  ['motionControl'],
  'tokenhubKlingVideo',
  '/v1/wand/kling/motion-control',
  135742,
  '/v1/wand/kling/tasks/{taskId}',
);
add(
  ['minimax-video-v2.3'],
  ['textToVideo', 'imageToVideo', 'startEndToVideo'],
  'tokenhubMinimaxVideo',
  '/v1/wand/minimax-video/generation',
  135737,
  '/v1/wand/minimax-video/tasks/{taskId}',
);
add(
  ['minimax-video-v2.3-fast'],
  ['imageToVideo'],
  'tokenhubMinimaxVideo',
  '/v1/wand/minimax-video/generation',
  135737,
  '/v1/wand/minimax-video/tasks/{taskId}',
);
add(
  ['minimax-video-h3', 'minimax-video-h3-max'],
  ['textToVideo', 'imageToVideo', 'startEndToVideo'],
  'tokenhubMinimaxVideoV2',
  '/v1/wand/minimax-video-v2/generation',
  135737,
  '/v1/wand/minimax-video-v2/tasks/{taskId}',
);
add(
  ['minimax-video-h3'],
  ['referenceToVideo'],
  'tokenhubMinimaxVideoV2',
  '/v1/wand/minimax-video-v2/generation',
  135737,
  '/v1/wand/minimax-video-v2/tasks/{taskId}',
);
add(
  ['yt-video-humanactor'],
  ['avatarVideo'],
  'tokenhubYoutuVideo',
  '/v1/api/video/submit',
  135716,
  '/v1/api/video/query',
);

const threeD = (models: string[], scenes: ModelFunction[], doc: number) =>
  add(
    models,
    scenes,
    'tokenhub3d',
    '/v1/api/3d/submit',
    doc,
    '/v1/api/3d/query',
  );
threeD(
  ['hy-3d-3.0', 'hy-3d-3.1'],
  ['textTo3d', 'imageTo3d', 'multiViewTo3d'],
  137181,
);
threeD(['hy-3d-express'], ['textTo3d', 'imageTo3d'], 137175);
threeD(['hy-3d-component'], ['threeDComponent'], 137176);
threeD(['hy-3d-format'], ['threeDFormat'], 137182);
threeD(['hy-3d-texture'], ['threeDTexture'], 137183);
threeD(['hy-3d-uv'], ['threeDUv'], 137777);
threeD(['hy-3d-retopology'], ['threeDRetopology'], 137778);
threeD(['hy-3d-rigging'], ['threeDRigging'], 137779);
threeD(['hy-3d-motion'], ['threeDMotion'], 137780);
threeD(['hy-3d-polygen-image'], ['imageTo3d'], 138193);
threeD(['hy-3d-polygen-mesh'], ['threeDRetopology'], 138194);
threeD(
  ['tripo-3d-3.1', 'tripo-3d-p1', 'tripo-3d-p2'],
  ['textTo3d', 'imageTo3d', 'multiViewTo3d'],
  137074,
);
threeD(['tripo-3d-rigging-check'], ['threeDRiggingCheck'], 137073);
threeD(['tripo-3d-rigging'], ['threeDRigging'], 137072);
threeD(['tripo-3d-animation'], ['threeDAnimation'], 137071);
threeD(['tripo-3d-format'], ['threeDFormat'], 137070);
threeD(
  ['hi3d-2.1', 'hi3d-3.0'],
  ['imageTo3d', 'multiViewTo3d', 'threeDTexture'],
  137207,
);
threeD(['rodin-gen-3d-2.5'], ['textTo3d', 'imageTo3d'], 139566);
add(
  ['hy-world2-scene'],
  ['worldScene'],
  'tokenhubWorldScene',
  '/v1/wand/hunyuan-video/world2-scene',
  136578,
  '/v1/wand/hunyuan-video/tasks/{taskId}',
);
add(
  ['hy-world2-panorama'],
  ['worldPanorama'],
  'tokenhubWorldPanorama',
  '/v1/wand/hunyuan-image/world2-panorama',
  136578,
);

for (const [model, syncDoc, asyncDoc] of [
  ['hy-asr-3.0-preview', 135791, 135792],
  ['wand-asr-v1', 135793, 135794],
] as const) {
  add(
    [model],
    ['speechRecognition'],
    'tokenhubAsrSync',
    '/v1/wand/asrproxy/sync_transcribe',
    syncDoc,
  );
  add(
    [model],
    ['speechRecognitionAsync'],
    'tokenhubAsrAsync',
    '/v1/wand/asrproxy/async_create',
    asyncDoc,
    '/v1/wand/asrproxy/tasks/{taskId}',
  );
}
add(
  [
    'minimax-speech-2.8-hd',
    'minimax-speech-2.8-turbo',
    'minimax-speech-2.6-hd',
    'minimax-speech-2.6-turbo',
    'minimax-speech-02-hd',
    'minimax-speech-02-turbo',
  ],
  ['speechSynthesis'],
  'tokenhubTts',
  '/v1/wand/minimax-tts/sync_tts',
  135796,
);
add(
  ['minimax-voice-clone'],
  ['voiceClone'],
  'tokenhubVoiceClone',
  '/v1/wand/minimax-tts/sync_clone',
  135798,
);
add(
  ['minimax-voice-design'],
  ['voiceDesign'],
  'tokenhubVoiceDesign',
  '/v1/wand/minimax-tts/sync_design',
  135797,
);
add(
  ['wand-dubbing-clone-v1', 'wand-dubbing-clone-v2'],
  ['dubbing'],
  'tokenhubDubbing',
  '/v1/wand/dubbing/async_generation',
  135800,
  '/v1/wand/dubbing/tasks/{taskId}',
);
add(
  ['minimax-music-v2.6', 'minimax-music-v3.0'],
  ['musicGeneration', 'instrumentalGeneration'],
  'tokenhubMusic',
  '/v1/wand/minimax-music/generation',
  135323,
);
add(
  ['mureka-music-v9'],
  ['musicGeneration'],
  'tokenhubMurekaMusic',
  '/v1/wand/mureka-music/generation',
  138805,
);
add(
  ['mureka-music-v9'],
  ['musicEasyGeneration'],
  'tokenhubMurekaMusic',
  '/v1/wand/mureka-music/easy-generation',
  138805,
);
add(
  ['mureka-music-v9'],
  ['instrumentalGeneration'],
  'tokenhubMurekaMusic',
  '/v1/wand/mureka-music/instrumental-generation',
  138805,
);

/** 总模型表中列出，但当前调用指南目录缺少明确端点，不能猜测后入库。 */
export const TOKENHUB_UNVERIFIED_MODELS = ['indextts-2', 'wand-dubbing-sts-v1'];
