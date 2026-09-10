/** 可在“AI 功能配置”中创建的业务能力。 */
export const AI_FEATURE_CONFIG_TYPES = [
  'chat',
  'documentParse',
  'ocr',
  'rerank',
] as const;
export type AiFeatureConfigType = (typeof AI_FEATURE_CONFIG_TYPES)[number];

/** 模型账号校验使用的能力集合；向量化仍由“向量配置”独立管理。 */
export const AI_MODEL_FEATURE_TYPES = [
  ...AI_FEATURE_CONFIG_TYPES,
  'embedding',
] as const;
export type AiModelFeatureType = (typeof AI_MODEL_FEATURE_TYPES)[number];

export const AI_RESPONSE_FORMATS = ['text', 'json', 'markdown'] as const;
export type AiResponseFormat = (typeof AI_RESPONSE_FORMATS)[number];
