type ExtractedVisualPrompt = {
  positiveTemplate: string;
  negativeTemplate: string;
  styleSummary: string;
  modelRules: string;
  variables: string[];
};

type ComposedVisualPrompt = {
  positivePrompt: string;
  negativePrompt: string;
  notes: string;
};

export const VISUAL_PROMPT_EXTRACT_SYSTEM = `你是视觉生成提示词架构师。分析给定工作流中的主提示词或正向提示词，提炼可复用的提示词风格、格式与规则；只有输入确实提供负向提示词时才总结负向格式。必须尊重能够确认的目标模型专用语法、标签顺序、权重格式和视频运动描述。不要把原提示词中的特定主体照抄进通用规则，也不要凭模型文件名编造未经输入支持的官方能力。只返回一个 JSON 对象，不要 Markdown，字段固定为 positiveTemplate、negativeTemplate、styleSummary、modelRules、variables。positiveTemplate 在协议中代表工作流的主提示词格式；negativeTemplate 可为空。positiveTemplate、styleSummary、modelRules 必须是非空字符串；无法确认模型官方专用语法时，modelRules 仍须根据原提示词总结可观察到的语言、分隔方式、标签顺序和结构，并明确说明“仅根据工作流原提示词归纳，未确认官方专用规则”。模板中可用 {{变量名}} 表示待替换内容；variables 为变量名字符串数组。`;

export const VISUAL_PROMPT_COMPOSE_SYSTEM = `你是视觉生成提示词助手。根据创作想法、目标模型和模板生成工作流可直接使用的主提示词；只有输入提供了负向模板时才生成负向提示词，否则 negativePrompt 返回空字符串。模板可能来自工作流自带的普通主提示词或正向提示词：只借鉴其语言、段落结构、标签顺序、风格表达和能够确认的模型专用语法，必须用用户想法替换原文中的主体、场景与动作，不得照抄无关内容。严格遵守输入中的提示词规则；不得混用其它模型的权重、标签或控制语法。负向提示词只描述需要避免的内容，不得与主提示词冲突。只返回一个 JSON 对象，不要 Markdown，字段固定为 positivePrompt、negativePrompt、notes；positivePrompt 在协议中承载工作流主提示词。`;

function objectFromAnswer(answer: string): Record<string, unknown> | null {
  const cleaned = answer
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const text = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export function parseExtractedVisualPrompt(
  answer: string,
): ExtractedVisualPrompt | null {
  const value = objectFromAnswer(answer);
  if (!value) return null;
  const positiveTemplate = text(value.positiveTemplate);
  const styleSummary = text(value.styleSummary);
  const modelRules = text(value.modelRules);
  if (!positiveTemplate || !styleSummary || !modelRules) return null;
  return {
    positiveTemplate,
    negativeTemplate: text(value.negativeTemplate),
    styleSummary,
    modelRules,
    variables: Array.isArray(value.variables)
      ? value.variables.map(text).filter(Boolean).slice(0, 30)
      : [],
  };
}

export function parseComposedVisualPrompt(
  answer: string,
): ComposedVisualPrompt | null {
  const value = objectFromAnswer(answer);
  if (!value) return null;
  const positivePrompt = text(value.positivePrompt);
  if (!positivePrompt) return null;
  return {
    positivePrompt,
    negativePrompt: text(value.negativePrompt),
    notes: text(value.notes),
  };
}
