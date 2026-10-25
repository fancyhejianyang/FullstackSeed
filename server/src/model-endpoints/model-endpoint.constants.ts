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
} as const;
export type ModelFunction = keyof typeof FUNCTION_LABELS;
export const MODEL_FUNCTIONS = Object.keys(FUNCTION_LABELS) as ModelFunction[];

export const PROTOCOLS = {
  openaiChat: {
    label: 'Chat Completions',
    functions: ['chat', 'vision'],
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
} as const;
export type ModelProtocol = keyof typeof PROTOCOLS;
export const MODEL_PROTOCOLS = Object.keys(PROTOCOLS) as ModelProtocol[];
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
