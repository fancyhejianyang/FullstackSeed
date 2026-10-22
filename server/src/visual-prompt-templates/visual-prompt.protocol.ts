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

export const VISUAL_PROMPT_EXTRACT_SYSTEM = `你是视觉生成提示词架构师。分析给定的官方示例或优秀提示词，提炼可复用规则。必须区分正向提示词与负向提示词，并尊重目标模型的专用语法、标签顺序、权重格式和视频运动描述。不要把某个示例的主体照抄进通用规则。只返回一个 JSON 对象，不要 Markdown，字段固定为 positiveTemplate、negativeTemplate、styleSummary、modelRules、variables。模板中可用 {{变量名}} 表示待替换内容；variables 为变量名字符串数组。`;

export const VISUAL_PROMPT_COMPOSE_SYSTEM = `你是视觉生成提示词助手。根据创作想法、目标模型和模板生成可直接使用的正向与负向提示词。模板可能来自工作流自带的原始提示词：只借鉴其语言、段落结构、标签顺序、风格表达和模型专用语法，必须用用户想法替换原文中的主体、场景与动作，不得照抄无关内容。严格遵守目标模型规则；不得混用其它模型的权重、标签或控制语法。负向提示词只描述需要避免的内容，不得与正向提示词冲突。只返回一个 JSON 对象，不要 Markdown，字段固定为 positivePrompt、negativePrompt、notes。`;

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
  if (!positiveTemplate) return null;
  return {
    positiveTemplate,
    negativeTemplate: text(value.negativeTemplate),
    styleSummary: text(value.styleSummary),
    modelRules: text(value.modelRules),
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
