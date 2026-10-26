import type { CreateModelEndpointDto } from './dto/model-endpoint.dto';
import {
  FUNCTION_LABELS,
  PLATFORM_LABELS,
  modelCategory,
  type ModelFunction,
  type PlatformType,
} from './model-endpoint.constants';

/** 负数 ID 是稳定系统标识；已移除的 -7/-8/-9 永不复用，不保存可编辑影子配置。 */
const definitions = [
  { id: -1, platformType: 'aliyunBailian', functionType: 'chat' },
  { id: -2, platformType: 'aliyunBailian', functionType: 'vision' },
  { id: -3, platformType: 'aliyunBailian', functionType: 'embedding' },
  { id: -4, platformType: 'tencentTokenhub', functionType: 'chat' },
  { id: -5, platformType: 'tencentTokenhub', functionType: 'vision' },
  { id: -6, platformType: 'tencentTokenhub', functionType: 'embedding' },
] as const;

export const BUILTIN_MODEL_ENDPOINTS = definitions.map(
  ({ id, platformType, functionType }) => ({
    id,
    platformType,
    // 仅用于展示适用范围；实际请求必须另选账号目录中的具体模型。
    modelCode: '*',
    modelName: `${PLATFORM_LABELS[platformType]} · ${FUNCTION_LABELS[functionType]}（系统通用）`,
    functionType,
    protocol:
      functionType === 'embedding'
        ? ('openaiEmbedding' as const)
        : ('openaiChat' as const),
    apiPath: `${platformType === 'aliyunBailian' ? '/compatible-mode' : ''}/v1/${functionType === 'embedding' ? 'embeddings' : 'chat/completions'}`,
    taskApiPath: '',
    taskMethod: 'GET' as const,
    executionMode: 'sync' as const,
    isActive: true,
    source: 'builtin' as const,
    isReadOnly: true,
    category: modelCategory(functionType),
    documentationUrl:
      platformType === 'aliyunBailian'
        ? functionType === 'embedding'
          ? 'https://help.aliyun.com/zh/model-studio/embedding-interfaces-compatible-with-openai'
          : 'https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions/'
        : `https://cloud.tencent.com/document/product/1823/${functionType === 'embedding' ? '133515' : functionType === 'vision' ? '136956' : '130079'}`,
  }),
);

export function builtinModelEndpoint(
  platformType: PlatformType,
  functionType: ModelFunction,
  modelCode?: string,
) {
  void modelCode;
  const rule = BUILTIN_MODEL_ENDPOINTS.find(
    (item) =>
      item.platformType === platformType && item.functionType === functionType,
  );
  return rule ? { ...rule } : null;
}

export function usesBuiltinModelEndpoint(card: CreateModelEndpointDto) {
  const rule = builtinModelEndpoint(
    card.platformType,
    card.functionType,
    card.modelCode,
  );
  return (
    !!rule &&
    rule.protocol === card.protocol &&
    rule.apiPath === card.apiPath &&
    rule.executionMode === card.executionMode &&
    !card.taskApiPath
  );
}

/** 百炼专用域名使用 /v1；其它官方通用域名使用卡片中的标准路径。 */
export function builtinModelEndpointPath(
  baseUrl: string,
  rule: {
    platformType: PlatformType;
    functionType: ModelFunction;
    apiPath: string;
  },
) {
  const host = new URL(baseUrl).hostname.toLowerCase().replace(/\.$/, '');
  return rule.platformType === 'aliyunBailian' &&
    host === 'coding.dashscope.aliyuncs.com' &&
    rule.functionType !== 'webSearch'
    ? `/v1/${rule.functionType === 'embedding' ? 'embeddings' : 'chat/completions'}`
    : rule.apiPath;
}
