export const AI_MATERIAL_STYLES = [
  { key: 'original', label: '原始描述', prompt: '' },
  {
    key: 'photorealistic',
    label: '写实摄影',
    prompt: '写实摄影，高质量细节，自然光影，真实材质',
  },
  {
    key: 'watercolor',
    label: '水彩',
    prompt: '水彩插画，柔和晕染，纸张肌理，清新色彩',
  },
  {
    key: 'flatIllustration',
    label: '扁平插画',
    prompt: '现代扁平插画，简洁构图，清晰色块，主体突出',
  },
  {
    key: 'cinematic',
    label: '电影质感',
    prompt: '电影级构图，戏剧化光影，层次丰富，氛围感强',
  },
  { key: 'custom', label: '自定义风格', prompt: '' },
] as const;

export type AiMaterialStyleKey = (typeof AI_MATERIAL_STYLES)[number]['key'];
export const AI_MATERIAL_STYLE_KEYS = AI_MATERIAL_STYLES.map(
  (item) => item.key,
);
export const AI_MATERIAL_STYLE_VERSION = 1;
export const AI_MATERIAL_GENERATION_MODES = [
  'textToImage',
  'imageToImage',
  'textToVideo',
  'imageToVideo',
] as const;
export type AiMaterialGenerationMode =
  (typeof AI_MATERIAL_GENERATION_MODES)[number];

export const AI_MATERIAL_MEDIA_TYPES = ['image', 'video'] as const;
export type AiMaterialMediaType = (typeof AI_MATERIAL_MEDIA_TYPES)[number];

export const AI_MATERIAL_VIDEO_RESOLUTIONS = ['480P', '720P', '1080P'] as const;
export type AiMaterialVideoResolution =
  (typeof AI_MATERIAL_VIDEO_RESOLUTIONS)[number];

export const AI_MATERIAL_VIDEO_RATIOS = [
  'adaptive',
  '16:9',
  '9:16',
  '1:1',
  '4:3',
  '3:4',
] as const;
export type AiMaterialVideoRatio = (typeof AI_MATERIAL_VIDEO_RATIOS)[number];

export const AI_MATERIAL_VIDEO_DURATIONS = [5, 10] as const;
export type AiMaterialVideoDuration =
  (typeof AI_MATERIAL_VIDEO_DURATIONS)[number];

export function materialMediaType(
  mode: AiMaterialGenerationMode,
): AiMaterialMediaType {
  return mode === 'textToVideo' || mode === 'imageToVideo' ? 'video' : 'image';
}

export function materialNeedsReferenceImage(mode: AiMaterialGenerationMode) {
  return mode === 'imageToImage' || mode === 'imageToVideo';
}

export function buildMaterialPrompt(payload: {
  prompt: string;
  styleKey: AiMaterialStyleKey;
  customStyle?: string | null;
  defaultRequirement?: string | null;
}) {
  const preset = AI_MATERIAL_STYLES.find(
    (item) => item.key === payload.styleKey,
  );
  const style =
    payload.styleKey === 'custom'
      ? payload.customStyle?.trim()
      : preset?.prompt;
  return [
    payload.defaultRequirement?.trim(),
    payload.prompt.trim(),
    style ? `画面风格：${style}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
