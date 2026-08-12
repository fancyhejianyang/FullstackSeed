import {
  Injectable,
  OnModuleInit,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Menu } from './entities/menu.entity';
import { CreateMenuDto, UpdateMenuDto } from './dto/menu.dto';

// 菜单树节点（实体 + children）
export interface MenuTreeNode extends Menu {
  children: MenuTreeNode[];
}

type SeedMenu = Partial<Menu> & { parentPath?: string };

// 内置菜单种子（path 对应前端路由）
// isSystem=true 为系统固定菜单：仅超管可见、不可分配给角色；业务菜单 isSystem=false 可分配。
const SEED_MENUS: SeedMenu[] = [
  { name: '首页', path: '/', icon: 'HomeFilled', sort: 0, permissionCode: '', isSystem: false },
  { name: '示例管理', path: '/demo', icon: 'Document', sort: 10, permissionCode: 'Demo.read', isSystem: false },
  { name: '账号管理', path: '/users', icon: 'User', sort: 20, permissionCode: 'User.read', isSystem: true },
  { name: '角色管理', path: '/roles', icon: 'UserFilled', sort: 30, permissionCode: 'Role.read', isSystem: true },
  { name: '权限管理', path: '/permissions', icon: 'Key', sort: 40, permissionCode: 'Permission.read', isSystem: true },
  { name: '菜单管理', path: '/menus', icon: 'Menu', sort: 50, permissionCode: 'Menu.read', isSystem: true },
  { name: '系统配置', path: '/system-config', icon: 'Setting', sort: 60, permissionCode: 'Menu.read', isSystem: true },
  { name: '配置菜单', path: '/system-config/menu', icon: 'Operation', sort: 10, permissionCode: 'Menu.read', isSystem: true, parentPath: '/system-config' },
  { name: 'AI 大模型账号', path: '/system-config/ai', icon: 'Connection', sort: 20, permissionCode: 'Menu.read', isSystem: true, parentPath: '/system-config' },
  { name: '微信 / 小程序', path: '/system-config/wechat', icon: 'ChatDotRound', sort: 30, permissionCode: 'Menu.read', isSystem: true, parentPath: '/system-config' },
  { name: '日志记录', path: '/system-config/log-record', icon: 'Tickets', sort: 40, permissionCode: 'Menu.read', isSystem: true, parentPath: '/system-config' },
  { name: '数据导入', path: '/system-config/data-import', icon: 'UploadFilled', sort: 50, permissionCode: 'Menu.read', isSystem: true, parentPath: '/system-config' },
  { name: 'OSS/CDN 配置', path: '/system-config/storage', icon: 'FolderOpened', sort: 60, permissionCode: 'Menu.read', isSystem: true, parentPath: '/system-config' },
];

// 锁定菜单路径：前端不限制操作，后端 API 对此类菜单统一做管理员身份校验
const PROTECTED_MENU_PATHS = ['/menus', '/system-config'];

@Injectable()
export class MenusService implements OnModuleInit {
  constructor(
    @InjectRepository(Menu)
    private readonly menuRepository: Repository<Menu>,
  ) {}

  /**
   * 启动时补齐内置菜单。
   * 已存在的菜单只做安全兜底，不覆盖 name/path/icon/sort/permissionCode 等可编辑字段，
   * 避免管理员在「菜单管理」里维护名称、路由后被服务重启还原。
   */
  async onModuleInit() {
    for (const seed of SEED_MENUS) {
      const parent = seed.parentPath
        ? await this.menuRepository.findOne({ where: { path: seed.parentPath } })
        : null;
      const { parentPath, ...menuSeed } = seed;
      const exist = await this.menuRepository.findOne({
        where: [
          ...(menuSeed.path ? [{ path: menuSeed.path }] : []),
          ...(menuSeed.name ? [{ name: menuSeed.name }] : []),
        ],
      });
      if (!exist) {
        await this.menuRepository.save(
          this.menuRepository.create({
            ...menuSeed,
            parentId: parent?.id ?? menuSeed.parentId ?? null,
          }),
        );
        continue;
      }
      if (parent && exist.parentId !== parent.id) {
        exist.parentId = parent.id;
        await this.menuRepository.save(exist);
      }
    }
  }

  /** 全部菜单（扁平，按 sort 升序） */
  private findAllFlat(): Promise<Menu[]> {
    return this.menuRepository.find({ order: { sort: 'ASC', id: 'ASC' } });
  }

  /** 扁平列表构建成树 */
  private buildTree(list: Menu[]): MenuTreeNode[] {
    const map = new Map<number, MenuTreeNode>();
    const roots: MenuTreeNode[] = [];
    list.forEach((m) => map.set(m.id, { ...(m as Menu), children: [] } as MenuTreeNode));
    map.forEach((node) => {
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }

  /** 完整菜单树（管理用） */
  async findTree(): Promise<MenuTreeNode[]> {
    return this.buildTree(await this.findAllFlat());
  }

  private splitPermissionCodes(code: string | undefined | null): string[] {
    if (!code) return [];
    return code
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  /**
   * 当前用户可见菜单树：
   * - 超管返回全部启用菜单
   * - 系统固定菜单（isSystem）仅超管可见
   * - 否则过滤掉 permissionCode 非空且用户无任一权限的项
   */
  async findMine(
    isAdmin: boolean,
    permissions: string[],
  ): Promise<MenuTreeNode[]> {
    const all = await this.findAllFlat();
    const visible = all.filter((m) => {
      if (!m.isActive) return false;
      if (isAdmin) return true;
      if (m.isSystem) return false;
      const codes = this.splitPermissionCodes(m.permissionCode);
      if (codes.length === 0) return true;
      return codes.some((code) => permissions.includes(code));
    });
    return this.buildTree(visible);
  }

  findOne(id: number) {
    return this.menuRepository.findOne({ where: { id } });
  }

  private isLockedMenu(menu: Pick<Menu, 'path' | 'isSystem'>): boolean {
    return (
      menu.isSystem ||
      (!!menu.path && PROTECTED_MENU_PATHS.includes(menu.path))
    );
  }

  private isLockedPath(path: string | undefined): boolean {
    return (
      !!path &&
      PROTECTED_MENU_PATHS.some(
        (protectedPath) =>
          path === protectedPath || path.startsWith(`${protectedPath}/`),
      )
    );
  }

  private assertAdminForLockedMenu(isAdmin: boolean, locked: boolean) {
    if (!isAdmin && locked) {
      throw new ForbiddenException('锁定菜单仅管理员可操作');
    }
  }

  private async assertCreateOrMoveAllowed(
    dto: Pick<CreateMenuDto, 'parentId' | 'path' | 'isSystem'>,
    isAdmin: boolean,
  ) {
    this.assertAdminForLockedMenu(
      isAdmin,
      !!dto.isSystem || this.isLockedPath(dto.path),
    );
    if (!dto.parentId) return;

    const parent = await this.menuRepository.findOne({
      where: { id: dto.parentId },
    });
    if (!parent) {
      throw new NotFoundException('上级菜单不存在');
    }
    this.assertAdminForLockedMenu(isAdmin, this.isLockedMenu(parent));
  }

  private collectDescendantIds(list: Menu[], parentId: number): number[] {
    const childrenMap = new Map<number, Menu[]>();
    list.forEach((item) => {
      if (!item.parentId) return;
      const children = childrenMap.get(item.parentId) ?? [];
      children.push(item);
      childrenMap.set(item.parentId, children);
    });

    const ids: number[] = [];
    const stack = [...(childrenMap.get(parentId) ?? [])];
    while (stack.length) {
      const current = stack.pop()!;
      ids.push(current.id);
      stack.push(...(childrenMap.get(current.id) ?? []));
    }
    return ids;
  }

  async create(dto: CreateMenuDto, isAdmin: boolean) {
    await this.assertCreateOrMoveAllowed(dto, isAdmin);
    return this.menuRepository.save(this.menuRepository.create(dto));
  }

  async update(id: number, dto: UpdateMenuDto, isAdmin: boolean) {
    const menu = await this.menuRepository.findOne({ where: { id } });
    if (!menu) {
      throw new NotFoundException('菜单不存在');
    }
    this.assertAdminForLockedMenu(
      isAdmin,
      this.isLockedMenu(menu) ||
        dto.isSystem === true ||
        this.isLockedPath(dto.path),
    );
    if (dto.parentId !== undefined) {
      await this.assertCreateOrMoveAllowed(dto, isAdmin);
    }
    Object.assign(menu, dto);
    return this.menuRepository.save(menu);
  }

  async remove(id: number, isAdmin: boolean) {
    const menu = await this.menuRepository.findOne({ where: { id } });
    if (!menu) {
      throw new NotFoundException('菜单不存在');
    }
    this.assertAdminForLockedMenu(isAdmin, this.isLockedMenu(menu));
    const descendants = this.collectDescendantIds(await this.findAllFlat(), id);
    const ids = [id, ...descendants];
    await this.menuRepository.softDelete(ids);
    return { id, ids };
  }
}
