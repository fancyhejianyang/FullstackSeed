import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * 当前登录用户信息（来自 JwtStrategy.validate 的返回值，挂载于 request.user）
 */
export interface AuthUser {
  userId: number;
  username: string;
  isAdmin: boolean;
  roles: string[];
  permissions: string[];
}

/**
 * 参数装饰器：注入当前登录用户。
 * 用法：getProfile(@CurrentUser() user: AuthUser)
 *      取单字段：@CurrentUser('userId') userId: number
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthUser = request.user;
    return data ? user?.[data] : user;
  },
);
