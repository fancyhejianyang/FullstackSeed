/** 查询词只允许来自本轮问题，模型不能虚构商品或修改指令授权。 */
export function normalizeProductText(value: string) {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

const QUERY_STOP_WORDS = new Set([
  '我', '我们', '我还', '我想', '你', '你们', '想', '想要', '想买', '买', '购买',
  '一个', '个', '一把', '的', '用', '用的', '有', '没有', '有没有', '还有',
  '哪些', '什么', '怎么', '如何', '多少', '给', '给我', '推荐', '选择',
  '款式', '规格', '参数', '产品', '商品', '型号', '价格', '重量', '尺寸',
  '睡觉', '家庭', '个人', '偶尔', '使用', '可以', '需要', '请问', '谢谢',
  '么', '吗', '嘛', '吧', '呢', '啊', 'sku',
]);

export function sanitizeProductKeywords(value: unknown, question: string): string[] {
  if (!Array.isArray(value)) return [];
  const source = normalizeProductText(question);
  return [...new Set(value.filter((item): item is string => typeof item === 'string')
    .map(normalizeProductText)
    .filter((item) => item.length >= 2 && item.length <= 40 &&
      !QUERY_STOP_WORDS.has(item) && !/^\d+$/.test(item) && source.includes(item)))].slice(0, 6);
}

/** 模型不可用时保留原问题分词；单字相邻词组合可覆盖“靠 / 枕”。 */
export function fallbackProductKeywords(question: string): string[] {
  const parts = [...new Intl.Segmenter('zh', { granularity: 'word' }).segment(question)];
  const words: string[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!part.isWordLike || QUERY_STOP_WORDS.has(part.segment)) continue;
    words.push(part.segment);
    const next = parts[index + 1];
    if (next?.isWordLike && !QUERY_STOP_WORDS.has(next.segment) &&
      /^[\p{Script=Han}]$/u.test(part.segment) && /^[\p{Script=Han}]$/u.test(next.segment)) {
      words.push(part.segment + next.segment);
    }
  }
  return sanitizeProductKeywords(words, question);
}
