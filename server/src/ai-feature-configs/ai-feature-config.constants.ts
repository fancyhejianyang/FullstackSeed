export const AI_FEATURE_TYPES = [
  'chat',
  'documentParse',
  'ocr',
  'embedding',
] as const;
export type AiFeatureType = (typeof AI_FEATURE_TYPES)[number];

export const AI_RESPONSE_FORMATS = ['text', 'json', 'markdown'] as const;
export type AiResponseFormat = (typeof AI_RESPONSE_FORMATS)[number];
