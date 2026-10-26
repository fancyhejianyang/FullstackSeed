export const PLATFORM_TYPES = [
  'tencentTokenhub',
  'aliyunBailian',
  'custom',
] as const;
export type PlatformType = (typeof PLATFORM_TYPES)[number];
export const PLATFORM_LABELS: Record<PlatformType, string> = {
  tencentTokenhub: '腾讯 TokenHub',
  aliyunBailian: '阿里云百炼',
  custom: '自定义平台',
};

/** 只识别真实 hostname，不根据模型名、路径或 URL 中的关键词猜测平台。 */
export function detectModelPlatform(value: string): PlatformType {
  try {
    const url = new URL(value.trim());
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return 'custom';
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (
      [
        'tokenhub.tencentmaas.com',
        'tokenhub-intl.tencentmaas.com',
        'tokenhub-intl.tencentcloudmaas.com',
      ].includes(host)
    )
      return 'tencentTokenhub';
    if (
      [
        'dashscope.aliyuncs.com',
        'dashscope-intl.aliyuncs.com',
        'dashscope-us.aliyuncs.com',
      ].includes(host) ||
      host.endsWith('.dashscope.aliyuncs.com') ||
      /^[a-z0-9-]+\.(?:cn-beijing|ap-southeast-1|ap-northeast-1|eu-central-1|us-east-1|cn-hongkong)\.maas\.aliyuncs\.com$/.test(
        host,
      )
    )
      return 'aliyunBailian';
  } catch {
    /* 编辑中的无效 URL 视为未识别。 */
  }
  return 'custom';
}

export const FUNCTION_LABELS = {
  chat: '普通调用',
  vision: '识别图片',
  embedding: '文本向量',
  textToImage: '文生图',
  imageToImage: '参考生图',
  textToVideo: '文生视频',
  imageToVideo: '图生视频',
  referenceToVideo: '参考生视频',
  startEndToVideo: '首尾帧生视频',
  omniVideo: '全能视频生成',
  motionControl: '动作控制',
  avatarVideo: '人像驱动',
  videoUnderstanding: '视频理解',
  multimodalEmbedding: '多模态向量',
  textTo3d: '文生 3D',
  imageTo3d: '图生 3D',
  multiViewTo3d: '多视图生 3D',
  threeDComponent: '3D 组件拆分',
  threeDFormat: '3D 格式转换',
  threeDTexture: '3D 纹理生成',
  threeDUv: '3D UV 展开',
  threeDRetopology: '3D 拓扑重构',
  threeDRiggingCheck: '3D 绑骨检查',
  threeDRigging: '3D 绑骨蒙皮',
  threeDAnimation: '3D 动画重定向',
  threeDMotion: '3D 动作生成',
  worldScene: '世界场景生成',
  worldPanorama: '世界全景生成',
  speechRecognition: '同步语音识别',
  speechRecognitionAsync: '异步语音识别',
  speechSynthesis: '语音合成',
  voiceClone: '音色复刻',
  voiceDesign: '音色设计',
  dubbing: '视频翻译配音',
  musicGeneration: '歌曲生成',
  musicEasyGeneration: '提示词生成歌曲',
  instrumentalGeneration: '纯音乐生成',
} as const;
/** 仅用于识别历史记录；不再作为可配置卡片功能公开。 */
export type RetiredModelFunction = 'webSearch';
export type ModelFunction = keyof typeof FUNCTION_LABELS | RetiredModelFunction;
export const MODEL_FUNCTIONS = Object.keys(FUNCTION_LABELS) as Array<
  keyof typeof FUNCTION_LABELS
>;

export const CATEGORY_FUNCTIONS = {
  language: ['chat'],
  image: ['textToImage', 'imageToImage'],
  video: [
    'textToVideo',
    'imageToVideo',
    'referenceToVideo',
    'startEndToVideo',
    'omniVideo',
    'motionControl',
    'avatarVideo',
  ],
  threeD: [
    'textTo3d',
    'imageTo3d',
    'multiViewTo3d',
    'threeDComponent',
    'threeDFormat',
    'threeDTexture',
    'threeDUv',
    'threeDRetopology',
    'threeDRiggingCheck',
    'threeDRigging',
    'threeDAnimation',
    'threeDMotion',
    'worldScene',
    'worldPanorama',
  ],
  audio: [
    'speechRecognition',
    'speechRecognitionAsync',
    'speechSynthesis',
    'voiceClone',
    'voiceDesign',
    'dubbing',
    'musicGeneration',
    'musicEasyGeneration',
    'instrumentalGeneration',
  ],
  understanding: ['vision', 'videoUnderstanding'],
  embedding: ['embedding', 'multimodalEmbedding'],
} as const satisfies Record<string, readonly ModelFunction[]>;
/** search 仅兼容历史记录，公开分类和 DTO 不再接受。 */
export type ModelCategory = keyof typeof CATEGORY_FUNCTIONS | 'search';
export const CATEGORY_LABELS: Record<keyof typeof CATEGORY_FUNCTIONS, string> =
  {
    language: '语言模型',
    image: '图像生成',
    video: '视频生成',
    threeD: '3D 与世界模型',
    audio: '语音与音乐',
    understanding: '多模态理解',
    embedding: '向量模型',
  };
export function modelCategory(scene: ModelFunction): ModelCategory {
  if (scene === 'webSearch') return 'search';
  return (Object.entries(CATEGORY_FUNCTIONS).find(([, scenes]) =>
    (scenes as readonly ModelFunction[]).includes(scene),
  )?.[0] ?? 'language') as ModelCategory;
}

export const PROTOCOLS = {
  openaiChat: {
    label: 'Chat Completions',
    functions: ['chat', 'vision', 'videoUnderstanding'],
    mode: 'sync',
  },
  openaiEmbedding: {
    label: 'Embeddings',
    functions: ['embedding'],
    mode: 'sync',
  },
  openaiImages: {
    label: 'OpenAI Images',
    functions: ['textToImage'],
    mode: 'sync',
  },
  dashscopeImage: {
    label: 'DashScope 多模态生图',
    functions: ['textToImage', 'imageToImage'],
    mode: 'sync',
  },
  dashscopeVideo: {
    label: 'DashScope 视频合成',
    functions: ['textToVideo', 'imageToVideo', 'referenceToVideo'],
    mode: 'async',
  },
  tokenhubHunyuanImage: {
    label: 'TokenHub 混元 Image 3.0',
    functions: ['textToImage', 'imageToImage'],
    mode: 'sync',
  },
  tokenhubHunyuanImageChat: {
    label: 'TokenHub 混元 Image 3.5',
    functions: ['textToImage', 'imageToImage'],
    mode: 'sync',
  },
  tokenhubSeedreamImage: {
    label: 'TokenHub Seedream',
    functions: ['textToImage', 'imageToImage'],
    mode: 'sync',
  },
  tokenhubViduImage: {
    label: 'TokenHub Vidu 生图',
    functions: ['textToImage', 'imageToImage'],
    mode: 'async',
  },
  tokenhubHunyuanVideo: {
    label: 'TokenHub 混元视频',
    functions: ['textToVideo', 'imageToVideo'],
    mode: 'async',
  },
  tokenhubViduVideo: {
    label: 'TokenHub Vidu 视频',
    functions: [
      'textToVideo',
      'imageToVideo',
      'referenceToVideo',
      'startEndToVideo',
    ],
    mode: 'async',
  },
  tokenhubWandImage: {
    label: 'TokenHub WAND 生图',
    functions: ['textToImage', 'imageToImage'],
    mode: 'async',
  },
  tokenhubKlingImage: {
    label: 'TokenHub Kling 生图',
    functions: ['textToImage', 'imageToImage'],
    mode: 'async',
  },
  tokenhubWandVideo: {
    label: 'TokenHub WAND 视频',
    functions: [
      'textToVideo',
      'imageToVideo',
      'referenceToVideo',
      'startEndToVideo',
    ],
    mode: 'async',
  },
  tokenhubPixverseVideo: {
    label: 'TokenHub PixVerse 视频',
    functions: [
      'textToVideo',
      'imageToVideo',
      'referenceToVideo',
      'startEndToVideo',
    ],
    mode: 'async',
  },
  tokenhubKlingVideo: {
    label: 'TokenHub Kling 视频',
    functions: [
      'textToVideo',
      'imageToVideo',
      'referenceToVideo',
      'startEndToVideo',
      'omniVideo',
      'motionControl',
    ],
    mode: 'async',
  },
  tokenhubMinimaxVideo: {
    label: 'TokenHub MiniMax 视频 V1',
    functions: ['textToVideo', 'imageToVideo', 'startEndToVideo'],
    mode: 'async',
  },
  tokenhubMinimaxVideoV2: {
    label: 'TokenHub MiniMax 视频 V2',
    functions: [
      'textToVideo',
      'imageToVideo',
      'referenceToVideo',
      'startEndToVideo',
    ],
    mode: 'async',
  },
  tokenhubYoutuVideo: {
    label: 'TokenHub 优图人像',
    functions: ['avatarVideo'],
    mode: 'async',
  },
  tokenhub3d: {
    label: 'TokenHub 3D 任务',
    functions: CATEGORY_FUNCTIONS.threeD.filter(
      (scene) => scene !== 'worldScene' && scene !== 'worldPanorama',
    ),
    mode: 'async',
  },
  tokenhubWorldScene: {
    label: 'TokenHub 世界场景',
    functions: ['worldScene'],
    mode: 'async',
  },
  tokenhubWorldPanorama: {
    label: 'TokenHub 世界全景',
    functions: ['worldPanorama'],
    mode: 'sync',
  },
  tokenhubAsrSync: {
    label: 'TokenHub 同步 ASR',
    functions: ['speechRecognition'],
    mode: 'sync',
  },
  tokenhubAsrAsync: {
    label: 'TokenHub 异步 ASR',
    functions: ['speechRecognitionAsync'],
    mode: 'async',
  },
  tokenhubTts: {
    label: 'TokenHub MiniMax TTS',
    functions: ['speechSynthesis'],
    mode: 'sync',
  },
  tokenhubVoiceClone: {
    label: 'TokenHub MiniMax 音色复刻',
    functions: ['voiceClone'],
    mode: 'sync',
  },
  tokenhubVoiceDesign: {
    label: 'TokenHub MiniMax 音色设计',
    functions: ['voiceDesign'],
    mode: 'sync',
  },
  tokenhubDubbing: {
    label: 'TokenHub WAND 配音',
    functions: ['dubbing'],
    mode: 'async',
  },
  tokenhubMusic: {
    label: 'TokenHub MiniMax 音乐',
    functions: ['musicGeneration', 'instrumentalGeneration'],
    mode: 'sync',
  },
  tokenhubMurekaMusic: {
    label: 'TokenHub Mureka 音乐',
    functions: [
      'musicGeneration',
      'musicEasyGeneration',
      'instrumentalGeneration',
    ],
    mode: 'sync',
  },
  tokenhubMultimodalEmbedding: {
    label: 'TokenHub 多模态 Embeddings',
    functions: ['multimodalEmbedding'],
    mode: 'sync',
  },
  openaiChatSearch: {
    label: 'TokenHub Chat 联网搜索',
    functions: ['webSearch'],
    mode: 'sync',
  },
  openaiResponses: {
    label: 'Responses 联网搜索',
    functions: ['webSearch'],
    mode: 'sync',
  },
} as const;
export type ModelProtocol = keyof typeof PROTOCOLS;
/** 搜索协议保留给内部适配器和旧记录，不再允许配置成接口卡片。 */
export const MODEL_PROTOCOLS = (
  Object.keys(PROTOCOLS) as ModelProtocol[]
).filter(
  (protocol) => !['openaiChatSearch', 'openaiResponses'].includes(protocol),
);
export function protocolTaskMethod(protocol: ModelProtocol): 'GET' | 'POST' {
  return protocol === 'tokenhub3d' || protocol === 'tokenhubYoutuVideo'
    ? 'POST'
    : 'GET';
}
export type MediaProtocol =
  | 'openai'
  | 'dashscope'
  | Extract<ModelProtocol, `tokenhub${string}`>;

export function mediaProtocol(protocol: ModelProtocol): MediaProtocol {
  if (protocol === 'dashscopeImage' || protocol === 'dashscopeVideo')
    return 'dashscope';
  if (protocol.startsWith('tokenhub')) return protocol as MediaProtocol;
  return 'openai';
}
