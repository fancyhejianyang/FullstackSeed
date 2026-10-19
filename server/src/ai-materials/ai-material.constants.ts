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
) as AiMaterialStyleKey[];
export const AI_MATERIAL_STYLE_VERSION = 1;

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
