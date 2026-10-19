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
    ];
    let nextId = 600;
    const repository = {
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
      '/system-config',
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
});
