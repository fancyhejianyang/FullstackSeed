import {
  Injectable,
  OnModuleInit,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { In, Like, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { Role } from '../roles/entities/role.entity';
import { Permission } from '../permissions/entities/permission.entity';
import { Menu } from '../menus/entities/menu.entity';
import {
  CreateUserDto,
  UpdateUserDto,
  QueryUserDto,
} from './dto/user.dto';

// 内置权限点种子（资源:动作）
const SEED_PERMISSIONS: Array<{
  code: string;
  name: string;
  type: 'menu' | 'button' | 'api';
}> = [
  { code: 'Role.read', name: '查看角色', type: 'api' },
  { code: 'Role.create', name: '创建角色', type: 'api' },
  { code: 'Role.update', name: '更新角色', type: 'api' },
  { code: 'Role.delete', name: '删除角色', type: 'api' },
  { code: 'Role.batchDelete', name: '批量删除角色', type: 'api' },
  { code: 'Permission.read', name: '查看权限', type: 'api' },
  { code: 'Permission.create', name: '创建权限', type: 'api' },
  { code: 'Permission.update', name: '更新权限', type: 'api' },
  { code: 'Permission.delete', name: '删除权限', type: 'api' },
  { code: 'Permission.batchDelete', name: '批量删除权限', type: 'api' },
  { code: 'User.read', name: '查看用户', type: 'api' },
  { code: 'User.create', name: '创建用户', type: 'api' },
  { code: 'User.update', name: '更新用户', type: 'api' },
  { code: 'User.delete', name: '删除用户', type: 'api' },
  { code: 'User.batchDelete', name: '批量删除用户', type: 'api' },
  { code: 'Menu.read', name: '查看菜单', type: 'api' },
  { code: 'Menu.create', name: '创建菜单', type: 'api' },
  { code: 'Menu.update', name: '更新菜单', type: 'api' },
  { code: 'Menu.delete', name: '删除菜单', type: 'api' },
  { code: 'Menu.batchDelete', name: '批量删除菜单', type: 'api' },
  { code: 'Article.read', name: '查看文章', type: 'api' },
  { code: 'Article.create', name: '创建文章', type: 'api' },
  { code: 'Article.update', name: '更新文章', type: 'api' },
  { code: 'Article.delete', name: '删除文章', type: 'api' },
  { code: 'Article.batchDelete', name: '批量删除', type: 'api' },
];

// 系统内置保留账号用户名：禁止创建同名、禁止删除
const RESERVED_USERNAMES = ['root', 'admin'];

// 无 permissionCode 的菜单兜底：菜单 name → 权限 Module 前缀
const MENU_NAME_TO_MODULE: Record<string, string> = {
  文章管理: 'Article',
  账号管理: 'User',
  角色管理: 'Role',
  权限管理: 'Permission',
  菜单管理: 'Menu',
};

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(Menu)
    private readonly menuRepository: Repository<Menu>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 应用启动时初始化 RBAC 种子数据：
   * 1. 补齐内置权限点
   * 2. 创建 admin 角色并绑定全量权限
   * 3. 用户表为空时创建默认管理员并绑定 admin 角色
   */
  async onModuleInit() {
    await this.cleanLegacyPermissions();
    const permissions = await this.ensurePermissions();
    await this.ensurePermissionMenuId(permissions);
    const adminRole = await this.ensureAdminRole(permissions);
    await this.ensureDefaultAdmin(adminRole);
  }

  /**
   * 自动将权限归属到菜单：
   * 遍历菜单表，取每个菜单的 Module 前缀（优先来自 permissionCode，其次兜底 MENU_NAME_TO_MODULE），
   * 把该 Module 下 menuId 为空的权限自动回填 menuId。
   * 目的：让权限管理页能按菜单分组显示权限点。
   */
  private async ensurePermissionMenuId(permissions: Permission[]): Promise<void> {
    const menus = await this.menuRepository.find();
    if (menus.length === 0) return;

    // 建立 Module → menuId 映射
    const moduleToMenuId = new Map<string, number>();
    for (const m of menus) {
      let mod = '';
      if (m.permissionCode) {
        const idx = m.permissionCode.indexOf('.');
        mod = idx > 0 ? m.permissionCode.slice(0, idx) : m.permissionCode;
      }
      if (!mod && MENU_NAME_TO_MODULE[m.name]) {
        mod = MENU_NAME_TO_MODULE[m.name];
      }
      if (mod && !moduleToMenuId.has(mod)) {
        moduleToMenuId.set(mod, m.id);
      }
    }

    // 回填 menuId 为空 且 Module 有对应菜单 的权限
    for (const p of permissions) {
      if (p.menuId != null) continue;
      const idx = p.code.indexOf('.');
      if (idx <= 0) continue;
      const mod = p.code.slice(0, idx);
      const menuId = moduleToMenuId.get(mod);
      if (menuId) {
        p.menuId = menuId;
        await this.permissionRepository.save(p);
      }
    }
  }

  /**
   * 清理不符合规范的旧权限点：
   * 权限码格式必须为 `Module.action`（模块首字母大写 + 点号 + 动作小写开头）。
   * 例如 `User.read` 合规；`user:read` / `article.view` 均不合规。
   * 匹配规则：`^[A-Z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*$`
   * 不合规的记录会被物理删除（同时会级联清掉 role_permissions 关联）。
   */
  private async cleanLegacyPermissions(): Promise<void> {
    const all = await this.permissionRepository.find({
      relations: { roles: true },
    });
    const validPattern = /^[A-Z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*$/;
    const legacy = all.filter((p) => !validPattern.test(p.code));
    if (legacy.length === 0) return;
    // 先解除与角色的多对多关联，避免外键阻塞
    for (const p of legacy) {
      if (p.roles?.length) {
        p.roles = [];
        await this.permissionRepository.save(p);
      }
    }
    await this.permissionRepository.delete(legacy.map((p) => p.id));
  }

  /** 补齐内置权限点（按 code 幂等） */
  private async ensurePermissions(): Promise<Permission[]> {
    for (const seed of SEED_PERMISSIONS) {
      const exist = await this.permissionRepository.findOne({
        where: { code: seed.code },
      });
      if (!exist) {
        await this.permissionRepository.save(
          this.permissionRepository.create(seed),
        );
      }
    }
    return this.permissionRepository.find();
  }

  /** 创建/更新 admin 角色，绑定全量权限 */
  private async ensureAdminRole(permissions: Permission[]): Promise<Role> {
    let role = await this.roleRepository.findOne({
      where: { code: 'admin' },
      relations: { permissions: true },
    });
    if (!role) {
      role = this.roleRepository.create({
        code: 'admin',
        name: '超级管理员',
        description: '系统内置超级管理员，拥有全部权限',
        isActive: true,
      });
    }
    role.permissions = permissions;
    return this.roleRepository.save(role);
  }

  /** 确保默认超级管理员 root 存在（幂等：无 root 则创建并绑定 admin 角色） */
  private async ensureDefaultAdmin(adminRole: Role): Promise<void> {
    const exist = await this.userRepository.findOne({
      where: { username: 'root' },
    });
    if (!exist) {
      const rounds = this.configService.get<number>('BCRYPT_SALT_ROUNDS', 10);
      const password = await bcrypt.hash('root123', rounds);
      await this.userRepository.save(
        this.userRepository.create({
          username: 'root',
          password,
          nickname: '超级管理员',
          isActive: true,
          isAdmin: true,
          roles: [adminRole],
        }),
      );
    }
  }

  /**
   * 按用户名查询（含密码字段与角色/权限关联，用于登录校验）
   */
  findOneByUsername(username: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .where('user.username = :username', { username })
      .getOne();
  }

  /**
   * 按 id 查询（不含密码，含角色/权限关联）
   */
  findOneById(id: number): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
      relations: { roles: { permissions: true } },
    });
  }

  /** 分页查询用户（支持用户名/昵称关键字搜索） */
  async findAll(query: QueryUserDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const qb = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      .orderBy('user.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.keyword) {
      qb.where('user.username LIKE :kw OR user.nickname LIKE :kw', {
        kw: `%${query.keyword}%`,
      });
    }
    const [list, total] = await qb.getManyAndCount();
    return { list, total };
  }

  /** 创建用户 */
  async create(dto: CreateUserDto): Promise<User> {
    if (RESERVED_USERNAMES.includes(dto.username.toLowerCase())) {
      throw new ConflictException('该用户名为系统保留账号，禁止使用');
    }
    const exist = await this.userRepository.findOne({
      where: { username: dto.username },
    });
    if (exist) {
      throw new ConflictException('用户名已存在');
    }
    const rounds = this.configService.get<number>('BCRYPT_SALT_ROUNDS', 10);
    const user = this.userRepository.create({
      username: dto.username,
      password: await bcrypt.hash(dto.password, rounds),
      nickname: dto.nickname ?? '',
      isActive: dto.isActive ?? true,
      isAdmin: dto.isAdmin ?? false,
      roles: dto.roleIds?.length
        ? await this.roleRepository.findBy({ id: In(dto.roleIds) })
        : [],
    });
    const saved = await this.userRepository.save(user);
    return this.findOneById(saved.id) as Promise<User>;
  }

  /** 更新用户（密码留空则不改；roleIds 传入则整体覆盖角色） */
  async update(id: number, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOneById(id);
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    if (dto.nickname !== undefined) user.nickname = dto.nickname;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.isAdmin !== undefined) user.isAdmin = dto.isAdmin;
    if (dto.password) {
      const rounds = this.configService.get<number>('BCRYPT_SALT_ROUNDS', 10);
      user.password = await bcrypt.hash(dto.password, rounds);
    }
    if (dto.roleIds) {
      user.roles = await this.roleRepository.findBy({ id: In(dto.roleIds) });
    }
    await this.userRepository.save(user);
    return this.findOneById(id) as Promise<User>;
  }

  /** 删除用户（软删除）：禁止删除系统内置账号、禁止删除自身 */
  async remove(id: number, currentUserId: number) {
    const user = await this.findOneById(id);
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    if (user.id === currentUserId) {
      throw new ForbiddenException('禁止删除当前登录账号');
    }
    if (RESERVED_USERNAMES.includes(user.username.toLowerCase())) {
      throw new ForbiddenException('系统内置账号禁止删除');
    }
    await this.userRepository.softDelete(id);
    return { id };
  }
}
