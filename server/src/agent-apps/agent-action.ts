import type {
  AgentActionType,
  AgentSkuDraftData,
} from './agent-apps.constants';

export interface AgentActionDecision {
  type: AgentActionType;
  queryBeforeWrite: boolean;
  // 确认表达只能定位真实草稿；不能作为绕过版本/幂等校验的写入凭证。
  writeIntent?: 'review' | 'unsupported';
}

const WRITE_PATTERN =
  /(?:新增|创建|录入|添加|建一个).{0,18}(?:sku|规格型号)|(?:sku|规格型号).{0,18}(?:新增|创建|录入|添加|入库)/i;
const QUERY_PATTERN =
  /查询|查一下|查找|搜索|有没有|是否有|已存在|多少|哪些|哪款|哪种|产品库|SKU\s*库/i;
const KNOWLEDGE_QUESTION_PATTERN =
  /什么是|是什么意思|为什么|怎么|如何|介绍一下|说明一下/;

export function classifyAgentAction(
  content: string,
  hasActiveDraft = false,
): AgentActionDecision {
  const text = content.trim();
  const confirmation = text.replace(/[\s，,。.!！]/g, '');
  const explicitConfirmation =
    confirmation.length <= 60 &&
    /^(?:好的?|符合|没问题|没有问题|信息无误|核对无误|确认无误|确认|同意)?(?:可以|请|现在|直接|确认|同意)?(?:入库|录入|提交|保存)(?:吧|即可)?$/.test(
      confirmation,
    );
  const draftAcknowledgement =
    hasActiveDraft &&
    /^(?:好的?|符合|没问题|信息无误|核对无误|确认|可以|同意)$/.test(
      confirmation,
    );
  if (explicitConfirmation || draftAcknowledgement) {
    return {
      type: hasActiveDraft ? 'prepare_write' : 'clarify',
      queryBeforeWrite: false,
      writeIntent: 'review',
    };
  }
  // 否定、询问或假设不能当作创建/修改草稿的指令。
  if (
    /不要|不用|不需要|不能|不可以|不可|不允许|不确认|不同意|暂不|先不|别.{0,8}(?:新增|创建|入库|录入|保存|提交)/.test(
      text,
    ) ||
    /^(?:如果|假如)/.test(text) ||
    (/[?？]|是否(?:可以|能够|能|允许|需要|新增|创建|录入|入库|写入|保存|提交)|能否|可否|能不能|可不可以|[吗么嘛][。.!！\s]*$/.test(
      text,
    ) &&
      /新增|创建|录入|入库|写入|保存|提交/.test(text)) ||
    KNOWLEDGE_QUESTION_PATTERN.test(text)
  ) {
    return { type: 'answer', queryBeforeWrite: false };
  }
  const wantsWrite = WRITE_PATTERN.test(text);
  const wantsQuery = QUERY_PATTERN.test(text);

  if (wantsWrite) {
    return {
      type: 'prepare_write',
      queryBeforeWrite:
        wantsQuery || /先.+(?:没有|不存在).+(?:新增|创建|录入)/.test(text),
    };
  }
  if (!wantsQuery && /新增|创建|录入|入库|写入|保存/.test(text)) {
    return {
      type: 'clarify',
      queryBeforeWrite: false,
      writeIntent: 'unsupported',
    };
  }
  if (
    hasActiveDraft &&
    /修改|改成|改为|补充|选择产品|产品是|规格|颜色|容量|名称|编码/.test(text)
  ) {
    return { type: 'prepare_write', queryBeforeWrite: false };
  }
  if (wantsQuery && !KNOWLEDGE_QUESTION_PATTERN.test(text)) {
    return { type: 'query', queryBeforeWrite: false };
  }
  if (text.length < 2) {
    return { type: 'clarify', queryBeforeWrite: false };
  }
  return { type: 'answer', queryBeforeWrite: false };
}

export function extractSkuDraftPatch(content: string) {
  const text = content.trim();
  const specifications: Record<string, unknown> = {};
  const pairPattern = /([\p{L}\p{N}_-]{1,20})\s*[:：=]\s*([^,，;；\n。]+)/gu;
  for (const match of text.matchAll(pairPattern)) {
    const key = match[1].trim();
    const value = match[2].trim();
    if (
      key &&
      value &&
      !['产品', '产品ID', 'SKU名称', 'SKU编码', '名称', '编码'].includes(key)
    ) {
      specifications[key] = value;
    }
  }

  const knownPatterns: Array<[string, RegExp]> = [
    ['颜色', /(?:颜色|色)\s*(?:是|为|改成|改为)?\s*([\p{L}\p{N}#-]{1,30})/u],
    [
      '容量',
      /(?:容量|存储|内存)\s*(?:是|为|改成|改为)?\s*([\p{L}\p{N}.+-]{1,30})/u,
    ],
    ['尺寸', /(?:尺寸|大小)\s*(?:是|为|改成|改为)?\s*([^，,。；;\n]{1,40})/u],
    ['型号', /(?:型号)\s*(?:是|为|改成|改为)?\s*([\p{L}\p{N}._-]{1,40})/u],
  ];
  knownPatterns.forEach(([key, pattern]) => {
    const value = text.match(pattern)?.[1]?.trim();
    if (value) specifications[key] = value;
  });

  return {
    name:
      text
        .match(
          /(?:SKU名称|名称|命名为|叫)\s*(?:是|为|[:：])?\s*([^，,。；;\n]{1,80})/i,
        )?.[1]
        ?.trim() ?? '',
    skuCode:
      text
        .match(
          /(?:SKU编码|编码)\s*(?:是|为|[:：])?\s*([A-Za-z0-9._-]{1,100})/i,
        )?.[1]
        ?.trim() ?? '',
    specifications,
  };
}

export function validateSkuDraft(data: AgentSkuDraftData) {
  const missingFields: string[] = [];
  const validationErrors: string[] = [];
  if (!Number.isInteger(data.productId) || Number(data.productId) < 1) {
    missingFields.push('productId');
  }
  if (!data.specifications || !Object.keys(data.specifications).length) {
    missingFields.push('specifications');
  }
  if (data.name.length > 160)
    validationErrors.push('SKU 名称不能超过 160 个字符');
  if (data.skuCode.length > 100)
    validationErrors.push('SKU 编码不能超过 100 个字符');
  if (Object.keys(data.specifications ?? {}).length > 50) {
    validationErrors.push('规格字段不能超过 50 项');
  }
  return { missingFields, validationErrors };
}
