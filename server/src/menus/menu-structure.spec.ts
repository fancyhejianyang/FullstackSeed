import { reorganizeSystemMenus, THIRD_PARTY_MENUS } from './menu-structure';
import { MenusService } from './menus.service';
import { Menu } from './entities/menu.entity';
import type { Repository } from 'typeorm';
describe('system menu migration', () => {
  it('reparents existing menu IDs idempotently and preserves customized visibility', async () => {
    const rows: Partial<Menu>[] = [
      {
        id: 501,
        name: 'OSS/CDN 配置',
        path: '/system-config/storage',
        isActive: false,
        isSystem: true,
      },
      {
        id: 502,
        name: '系统管理',
        path: '/system-config',
        isSystem: false,
        isActive: true,
      },
      {
        id: 503,
        name: '账号管理',
        path: '/users',
        isSystem: false,
        isActive: false,
      },
      {
        id: 504,
        name: '日志记录',
        path: '/system-config/log-record',
        isSystem: false,
        isActive: true,
      },
      {
        id: 505,
        name: '数据导入',
        path: '/system-config/data-import',
        isSystem: false,
        isActive: true,
      },
      {
        id: 506,
        name: '菜单可见性配置',
        path: '/system-config/menu',
        isSystem: true,
        isActive: true,
      },
      {
        id: 507,
        name: '权限管理',
        path: '/permissions',
        isSystem: false,
        isActive: true,
      },
    ];
    let nextId = 600;
    const repository = {
      find: jest.fn(() => Promise.resolve(rows)),
      findOne: jest.fn(
        ({ where }: { where: Partial<Menu> | Partial<Menu>[] }) =>
          Promise.resolve(
            rows.find((row) =>
              (Array.isArray(where) ? where : [where]).some((w) =>
                Object.entries(w).every(
                  ([key, value]) => row[key as keyof Menu] === value,
                ),
              ),
            ) ?? null,
          ),
      ),
      create: jest.fn((value: Partial<Menu>) => value),
      save: jest.fn((value: Partial<Menu>) => {
        const item = { id: ++nextId, isActive: true, ...value };
        rows.push(item);
        return Promise.resolve(item);
      }),
      update: jest.fn((id: number, value: Partial<Menu>) => {
        Object.assign(rows.find((r) => r.id === id)!, value);
        return Promise.resolve({});
      }),
    };
    const service = new MenusService(repository as unknown as Repository<Menu>);
    await service.onModuleInit();
    const count = rows.length;
    await service.onModuleInit();
    expect(rows).toHaveLength(count);
    expect(rows.find((r) => r.id === 501)).toMatchObject({
      path: '/third-party-config/storage',
      parentId: rows.find((r) => r.path === '/third-party-config')?.id,
      isActive: false,
      isSystem: true,
    });
    expect(
      rows.filter((r) => r.path === '/third-party-config/storage'),
    ).toHaveLength(1);
    const accessId = rows.find((r) => r.path === '/access-control')?.id;
    expect(rows.find((r) => r.id === 502)).toMatchObject({
      name: '系统配置',
      isSystem: false,
      isActive: true,
    });
    expect(rows.find((r) => r.id === 503)).toMatchObject({
      parentId: accessId,
      isActive: false,
      isSystem: false,
    });
    expect(rows.find((r) => r.id === 504)).toMatchObject({
      name: '操作日志',
      parentId: accessId,
      permissionCode: 'LogRecord.read',
    });
    expect(rows.find((r) => r.id === 505)).toMatchObject({
      name: '导入配置',
      parentId: 502,
      permissionCode: 'DataImport.read',
    });
    expect(rows.find((r) => r.id === 506)).toMatchObject({ isActive: false });
    expect(rows.find((r) => r.id === 507)).toMatchObject({
      name: '权限定义',
      parentId: accessId,
    });
    const logMenu = await service.findMine(false, ['LogRecord.read']);
    expect(
      logMenu
        .find((r) => r.path === '/access-control')
        ?.children.map((r) => r.path),
    ).toEqual(['/system-config/log-record']);
    expect(logMenu.some((r) => r.path === '/system-config')).toBe(false);
    const importMenu = await service.findMine(false, ['DataImport.read']);
    expect(
      importMenu
        .find((r) => r.path === '/system-config')
        ?.children.map((r) => r.path),
    ).toEqual(['/system-config/data-import']);
    const oldPermission = await service.findMine(false, ['Menu.read']);
    expect(JSON.stringify(oldPermission)).not.toContain(
      '/system-config/log-record',
    );
    expect(JSON.stringify(oldPermission)).not.toContain(
      '/system-config/data-import',
    );
    expect(JSON.stringify(await service.findMine(true, []))).not.toContain(
      '菜单可见性配置',
    );
    rows.splice(0);
    await service.onModuleInit();
    expect(rows.some((r) => r.path === '/system-config/menu')).toBe(false);
    expect(rows.some((r) => r.path === '/access-control')).toBe(true);
  });
  it('separates integrations, keeps compatibility paths and moves domain rules to knowledge', () => {
    const result = reorganizeSystemMenus([
      { path: '/system-config' },
      ...THIRD_PARTY_MENUS.map((s) => ({
        path: '/system-config/' + s.key,
        isSystem: true,
      })),
      { path: '/system-config/document-parse' },
      { path: '/users' },
    ]);
    expect(result.filter((s) => s.path === '/system-config')).toHaveLength(1);
    for (const service of THIRD_PARTY_MENUS) {
      expect(
        result.find((s) => s.path === '/third-party-config/' + service.key),
      ).toMatchObject({
        parentPath: '/third-party-config',
        legacyPaths: ['/system-config/' + service.key],
        permissionCode: service.permission + '.read',
        preserveVisibility: true,
        reconcile: true,
      });
    }
    expect(
      result.find((s) => s.path === '/knowledge-bases/document-parse')
        ?.parentPath,
    ).toBe('/knowledge-bases');
    expect(result.find((s) => s.path === '/users')?.parentPath).toBe(
      '/access-control',
    );
    expect(
      result.find((s) => s.path === '/system-config/home')?.permissionCode,
    ).toBe('DashboardConfig.read');
    expect(
      result
        .filter((s) => s.path?.startsWith('/third-party-config'))
        .every((s) => !s.permissionCode?.includes('Menu.read')),
    ).toBe(true);
  });
  it('separates group permissions and retires the duplicate scope entry without deleting its ID', () => {
    const result = reorganizeSystemMenus([{ path: '/system-config/menu' }]);
    expect(result.find((s) => s.path === '/system-config')).toMatchObject({
      name: '系统配置',
      permissionCode: 'DashboardConfig.read,Menu.read,DataImport.read',
    });
    expect(result.find((s) => s.path === '/access-control')).toMatchObject({
      permissionCode: 'User.read,Role.read,Permission.read,LogRecord.read',
      isSystem: false,
    });
    expect(result.find((s) => s.path === '/system-config/menu')).toMatchObject({
      retired: true,
      reconcile: true,
    });
  });
});
