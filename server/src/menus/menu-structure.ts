import type { Menu } from './entities/menu.entity';
export type StructuredMenuSeed = Partial<Menu> & {
  parentPath?: string;
  legacyPaths?: string[];
  reconcile?: boolean;
  preserveVisibility?: boolean;
  retired?: boolean;
  matchByName?: boolean;
};
export const THIRD_PARTY_MENUS = [
  { key: 'ai', name: 'AI 大模型账号', permission: 'KnowledgeAiProvider' },
  { key: 'wechat', name: '微信 / 小程序', permission: 'WechatConfig' },
  { key: 'storage', name: 'OSS / CDN', permission: 'StorageConfig' },
  { key: 'mineru', name: 'MinerU 解析服务', permission: 'MineruConfig' },
  { key: 'vector', name: '向量化服务', permission: 'VectorConfig' },
] as const;
export function reorganizeSystemMenus(
  seeds: StructuredMenuSeed[],
): StructuredMenuSeed[] {
  const systemPermissions = [
    'DashboardConfig.read',
    'Menu.read',
    'DataImport.read',
  ];
  const accessPermissions = [
    'User.read',
    'Role.read',
    'Permission.read',
    'LogRecord.read',
  ];
  const thirdPermissions = THIRD_PARTY_MENUS.map((x) => x.permission + '.read');
  const system: StructuredMenuSeed = {
    name: '系统配置',
    path: '/system-config',
    icon: 'Setting',
    sort: 70,
    permissionCode: systemPermissions.join(','),
    isSystem: false,
    reconcile: true,
    preserveVisibility: true,
  };
  const access: StructuredMenuSeed = {
    name: '权限与审计',
    path: '/access-control',
    icon: 'Lock',
    sort: 71,
    permissionCode: accessPermissions.join(','),
    isSystem: false,
    reconcile: true,
    preserveVisibility: true,
  };
  const third: StructuredMenuSeed = {
    name: '第三方配置',
    path: '/third-party-config',
    icon: 'Connection',
    sort: 72,
    permissionCode: thirdPermissions.join(','),
    isSystem: false,
    reconcile: true,
    preserveVisibility: true,
  };
  const next = seeds
    .filter((s) => s.path !== '/system-config')
    .map((s): StructuredMenuSeed => {
      const target = THIRD_PARTY_MENUS.find(
        (t) => s.path === '/system-config/' + t.key,
      );
      if (target)
        return {
          ...s,
          name: target.name,
          path: '/third-party-config/' + target.key,
          parentPath: '/third-party-config',
          permissionCode: target.permission + '.read',
          isSystem: false,
          legacyPaths: [s.path!],
          reconcile: true,
          preserveVisibility: true,
        };
      if (s.path === '/system-config/document-parse')
        return {
          ...s,
          name: '文档解析规则',
          path: '/knowledge-bases/document-parse',
          parentPath: '/knowledge-bases',
          permissionCode: 'KnowledgeBase.read',
          isSystem: false,
          legacyPaths: [s.path],
          reconcile: true,
          preserveVisibility: true,
        };
      if (['/users', '/roles', '/permissions'].includes(s.path ?? ''))
        return {
          ...s,
          ...(s.path === '/permissions' ? { name: '权限定义' } : {}),
          parentPath: '/access-control',
          reconcile: true,
          preserveVisibility: true,
        };
      if (s.path === '/system-config/log-record')
        return {
          ...s,
          name: '操作日志',
          parentPath: '/access-control',
          permissionCode: 'LogRecord.read',
          reconcile: true,
          preserveVisibility: true,
        };
      if (s.path === '/system-config/data-import')
        return {
          ...s,
          name: '导入配置',
          permissionCode: 'DataImport.read',
          reconcile: true,
          preserveVisibility: true,
        };
      if (s.path === '/menus')
        return {
          ...s,
          parentPath: '/system-config',
          reconcile: true,
          preserveVisibility: true,
        };
      if (s.path === '/system-config/menu')
        return {
          ...s,
          name: '分配范围（已并入菜单管理）',
          retired: true,
          reconcile: true,
          preserveVisibility: true,
        };
      return s;
    });
  return [
    system,
    access,
    third,
    ...next,
    {
      name: '首页配置',
      path: '/system-config/home',
      icon: 'House',
      sort: 1,
      permissionCode: 'DashboardConfig.read',
      isSystem: false,
      parentPath: '/system-config',
    },
    {
      name: '服务概览',
      path: '/third-party-config/overview',
      icon: 'Grid',
      sort: 1,
      permissionCode: thirdPermissions.join(','),
      isSystem: false,
      parentPath: '/third-party-config',
    },
  ];
}
