import type { MenuNode } from '@/api/menu';
import type { PermissionModule } from '@/api/permission';

export interface PermissionTreeNode {
  id: string;
  label: string;
  permissionCode?: string;
  children?: PermissionTreeNode[];
}

const enabled = (value: unknown) =>
  value === true || value === 1 || value === '1' || value === 'true';

function menuModules(menu: MenuNode): string[] {
  const modules = (menu.permissionCode || '')
    .split(',')
    .map((code) => code.trim())
    .filter((code) => /^[A-Z]\w*\.[a-z]\w*$/.test(code))
    .map((code) => code.split('.')[0]!);
  if (menu.path === '/third-party-config/storage') modules.push('MediaStorage');
  return [...new Set(modules)];
}

/** 菜单决定可分配范围，注册表决定实际动作，同一模块只出现一次。 */
export function buildPermissionTree(
  menus: MenuNode[],
  modules: PermissionModule[],
): PermissionTreeNode[] {
  const catalog = new Map(modules.map((module) => [module.code, module]));
  const mentioned = new Set<string>();
  const used = new Set<string>();
  const collect = (items: MenuNode[]) =>
    items.forEach((menu) => {
      menuModules(menu).forEach((code) => mentioned.add(code));
      collect(menu.children || []);
    });
  collect(menus);
  const actions = (module: PermissionModule) =>
    module.actions.map((action) => ({
      id: `permission-${module.code}.${action.code}`,
      label: `${action.name}（${module.code}.${action.code}）`,
      permissionCode: `${module.code}.${action.code}`,
    }));
  const build = (items: MenuNode[]): PermissionTreeNode[] =>
    items.flatMap((menu) => {
      if (enabled(menu.isSystem) || !enabled(menu.isActive)) return [];
      const children = build(menu.children || []);
      // 目录的权限只是子菜单聚合，不重复生成授权项。
      if (!menu.children?.length) {
        for (const code of menuModules(menu)) {
          const module = catalog.get(code);
          if (!module || used.has(code)) continue;
          used.add(code);
          children.push(...actions(module));
        }
      }
      return children.length
        ? [{ id: `menu-${menu.id}`, label: menu.name, children }]
        : [];
    });
  const tree = build(menus);
  // 真正未关联菜单的后台模块仍可授权；已关联但停用/仅超管的模块不能借此绕过。
  const unlinked = modules
    .filter((module) => !mentioned.has(module.code))
    .map((module) => ({
      id: `module-${module.code}`,
      label: module.name,
      children: actions(module),
    }));
  if (unlinked.length)
    tree.push({
      id: 'group-unlinked',
      label: '未关联菜单的模块',
      children: unlinked,
    });
  return tree;
}

export function permissionTreeCodes(nodes: PermissionTreeNode[]): string[] {
  return nodes.flatMap((node) => [
    ...(node.permissionCode ? [node.permissionCode] : []),
    ...permissionTreeCodes(node.children || []),
  ]);
}

export function mergePermissionSelection(
  existing: string[],
  displayed: string[],
  selected: string[],
): string[] {
  const visible = new Set(displayed);
  return [
    ...new Set([
      ...existing.filter((code) => !visible.has(code)),
      ...selected.filter((code) => visible.has(code)),
    ]),
  ];
}
