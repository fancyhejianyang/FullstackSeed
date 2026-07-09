import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { AuthUser } from '../decorators/current-user.decorator';

/**
 * 权限守卫（全局，位于 JwtAuthGuard 之后）：
 * - @Public() 接口直接放行
 * - 未标注 @RequirePermissions 的接口仅需登录即可访问
 * - 标注的接口需 request.user.permissions 包含全部所需权限点
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = request.user;

    // 超级管理员放行一切权限
    if (user?.isAdmin) {
      return true;
    }

    const owned = user?.permissions ?? [];

    const hasAll = required.every((p) => owned.includes(p));
    if (!hasAll) {
      throw new ForbiddenException('无权限访问该资源');
    }
    return true;
  }
}
