import { SetMetadata } from '@nestjs/common';

/**
 * 标记接口所需权限点（权限编码列表，需全部满足）。
 * 权限码格式：`Module.action`（模块首字母大写 + 点号 + 动作小写开头），
 * 例如 User.read / Article.create / Menu.batchDelete。
 * 用法：@RequirePermissions('User.create', 'User.update')
 */
export const PERMISSIONS_KEY = 'requiredPermissions';
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
