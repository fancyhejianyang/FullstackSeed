/** 示例分类 */
export const DEMO_CATEGORIES = ['original', 'reprint', 'translation'] as const;
export type DemoCategory = (typeof DEMO_CATEGORIES)[number];
