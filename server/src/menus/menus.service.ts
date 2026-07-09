import { Injectable, OnModuleInit, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Menu } from './entities/menu.entity';
import { CreateMenuDto, UpdateMenuDto } from './dto/menu.dto';

// 菜单树节点（实体 + children）
export interface MenuTreeNode extends Menu {
  children: MenuTreeNode[];
}

// 内置菜单种子（path 对应前端路由）
const SEED_MENUS: Array<Partial<Menu>> = [
  { name: '首页', path: '/', icon: 'HomeFilled', sort: 0, permissionCode: '' },
  { name: '文章管理', path: '/articles', icon: 'Document', sort: 10, permissionCode: 'Article.read' },
  { name: '账号管理', path: '/users', icon: 'User', sort: 20, permissionCode: 'User.read' },
  { name: '角色管理', path: '/roles', icon: 'UserFilled', sort: 30, permissionCode: 'Role.read' },
  { name: '权限管理', path: '/permissions', icon: 'Key', sort: 40, permissionCode: 'Permission.read' },
];

@Injectable()
export class MenusService implements OnModuleInit {
  constructor(
    @InjectRepository(Menu)
    private readonly menuRepository: Repository<Menu>,
  ) {}

  /** 启动时补齐内置菜单（按 name 幂等） */
  async onModuleInit() {
    for (const seed of SEED_MENUS) {
      const exist = await this.menuRepository.findOne({
        where: { name: seed.name },
      });
      if (!exist) {
        await this.menuRepository.save(this.menuRepository.create(seed));
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

  /**
   * 当前用户可见菜单树：
   * - 超管返回全部启用菜单
   * - 否则过滤掉 permissionCode 非空且用户无该权限的项
   */
  async findMine(
    isAdmin: boolean,
    permissions: string[],
  ): Promise<MenuTreeNode[]> {
    const all = await this.findAllFlat();
    const visible = all.filter((m) => {
      if (!m.isActive) return false;
      if (isAdmin) return true;
      if (!m.permissionCode) return true;
      return permissions.includes(m.permissionCode);
    });
    return this.buildTree(visible);
  }

  findOne(id: number) {
    return this.menuRepository.findOne({ where: { id } });
  }

  create(dto: CreateMenuDto) {
    return this.menuRepository.save(this.menuRepository.create(dto));
  }

  async update(id: number, dto: UpdateMenuDto) {
    const menu = await this.menuRepository.findOne({ where: { id } });
    if (!menu) {
      throw new NotFoundException('菜单不存在');
    }
    Object.assign(menu, dto);
    return this.menuRepository.save(menu);
  }

  async remove(id: number) {
    const menu = await this.menuRepository.findOne({ where: { id } });
    if (!menu) {
      throw new NotFoundException('菜单不存在');
    }
    await this.menuRepository.softDelete(id);
    return { id };
  }
}
