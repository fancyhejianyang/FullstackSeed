// 本文件收纳固定字典和API字典
//
// 使用方式：
//   import { ARTICLE_CATEGORY, ARTICLE_STATUS } from '@/dic'
//   DicService.init(ARTICLE_CATEGORY, items)  // 直接写入 Ref
//   const dic = await DicService.init(ARTICLE_CATEGORY)
//   dic.getLabel('original') // → '原创'

import type { DicDefinition } from './service'

// ========== 文章分类 ==========
export const ARTICLE_CATEGORY = {
    isStatic: true,
    items: [
        { label: '原创', value: 'original' },
        { label: '转载', value: 'reprint' },
        { label: '翻译', value: 'translation' },
    ],
} satisfies DicDefinition

// ========== 文章状态 ==========
export const ARTICLE_STATUS = {
    isStatic: true,
    items: [
        { label: '草稿', value: 'draft' },
        { label: '已发布', value: 'published' },
    ],
} satisfies DicDefinition

// ========== API字典 ==========
export const ROLES = {
    isStatic: false,
    api: '/roles/all',
} satisfies DicDefinition