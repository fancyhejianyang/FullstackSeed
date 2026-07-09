import { SetMetadata } from '@nestjs/common';

/**
 * 标记接口为公开（跳过 JwtAuthGuard 鉴权）
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
