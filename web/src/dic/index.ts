// 本文件收纳固定字典和API字典
//
// 使用方式：
//   import { DEMO_CATEGORY, DEMO_STATUS } from '@/dic'
//   DicService.init(DEMO_CATEGORY, items)  // 直接写入 Ref
//   const dic = await DicService.init(DEMO_CATEGORY)
//   dic.getLabel('original') // → '原创'

import type { DicDefinition } from './service'

// ========== 示例分类 ==========
export const DEMO_CATEGORY = {
    isStatic: true,
    items: [
        { label: '原创', value: 'original' },
        { label: '转载', value: 'reprint' },
        { label: '翻译', value: 'translation' },
    ],
} satisfies DicDefinition

// ========== 示例状态 ==========
export const DEMO_STATUS = {
    isStatic: true,
    items: [
        { label: '草稿', value: 'draft' },
        { label: '已发布', value: 'published' },
    ],
} satisfies DicDefinition

// ========== 示例标签 ==========
export const DEMO_TAG = {
    isStatic: true,
    items: [
        { label: '前端', value: 'frontend' },
        { label: '后端', value: 'backend' },
        { label: '运维', value: 'ops' },
        { label: '设计', value: 'design' },
    ],
} satisfies DicDefinition

// ========== API字典 ==========
export const ROLES = {
    isStatic: false,
    api: '/roles/all',
} satisfies DicDefinition
