/** 示例分类 */
export const DEMO_CATEGORIES = ['original', 'reprint', 'translation'] as const;
export type DemoCategory = (typeof DEMO_CATEGORIES)[number];

/** 示例状态 */
export const DEMO_STATUSES = ['draft', 'published'] as const;
export type DemoStatus = (typeof DEMO_STATUSES)[number];
