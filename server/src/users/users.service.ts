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
import { CreateUserDto, UpdateUserDto, QueryUserDto } from './dto/user.dto';

const STANDARD_ACTIONS = [
  ['read', '查看'],
  ['create', '新增'],
  ['update', '编辑'],
  ['delete', '删除'],
  ['batchDelete', '批量删除'],
] as const;

const ADMIN_PERMISSION_MODULES = [
  'Demo',
  'KnowledgeBase',
  'User',
  'Role',
  'Permission',
  'Menu',
];

// 内置权限点种子：只保存基础动作目录。
// 角色授权时由「菜单模块 × 基础动作」组合成完整权限码并存入 roles.permissionCodes。
const SEED_PERMISSIONS: Array<{
  code: string;
  name: string;
  type: 'menu' | 'button' | 'api';
}> = [
  ...STANDARD_ACTIONS.map(([code, name]) => ({
    code,
    name,
    type: 'button' as const,
  })),
];

// 系统内置保留账号用户名：禁止创建同名、禁止删除
const RESERVED_USERNAMES = ['root', 'admin'];

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 应用启动时初始化 RBAC 种子数据：
   * 1. 补齐内置权限点
   * 2. 创建 admin 角色并绑定全量权限
   * 3. 用户表为空时创建默认管理员并绑定 admin 角色
   */
  async onModuleInit() {
    await this.migrateRolePermissionCodes();
    await this.cleanLegacyPermissions();
    const permissions = await this.ensurePermissions();
    const adminRole = await this.ensureAdminRole(permissions);
    await this.ensureDefaultAdmin(adminRole);
  }

  private getDefaultAdminPermissionCodes(): string[] {
    return ADMIN_PERMISSION_MODULES.flatMap((module) =>
      STANDARD_ACTIONS.map(([action]) => `${module}.${action}`),
    );
  }

  /**
   * 旧版本曾把 Demo.read 这类完整权限写进 permissions 表并通过 role_permissions 关联。
   * 新模型下完整权限归属角色字段，启动时先迁移到 roles.permissionCodes，再清理 permissions 表。
   */
  private async migrateRolePermissionCodes(): Promise<void> {
    const roles = await this.roleRepository.find({
      relations: { permissions: true },
    });
    const modulePermissionPattern = /^[A-Z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*$/;
    for (const role of roles) {
      const existing = role.permissionCodes ?? [];
      const fromRelations = (role.permissions ?? [])
        .map((permission) => permission.code)
        .filter((code) => modulePermissionPattern.test(code));
      const merged = Array.from(new Set([...existing, ...fromRelations]));
      if (merged.length !== existing.length) {
        role.permissionCodes = merged;
        await this.roleRepository.save(role);
      }
    }
  }

  /**
   * 清理不符合规范的旧权限点：
   * 权限管理只保留基础动作标识（read / batchDelete）。
   * `Role.read` / `user:read` 等旧格式不合规，会被物理删除（同时级联清掉 role_permissions 关联）。
   */
  private async cleanLegacyPermissions(): Promise<void> {
    const all = await this.permissionRepository.find({
      relations: { roles: true },
    });
    const validPattern = /^[a-z][A-Za-z0-9]*$/;
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
    role.permissionCodes = this.getDefaultAdminPermissionCodes();
    return this.roleRepository.save(role);
  }

  /** 确保默认超级管理员 root 存在（幂等：无 root 则创建并绑定 admin 角色） */
  private async ensureDefaultAdmin(adminRole: Role): Promise<void> {
    const exist = await this.userRepository.findOne({
      where: { username: 'root' },
    });
    if (!exist) {
      const rounds = this.configService.get<number>('BCRYPT_SALT_ROUNDS', 10);
      const adminPassword = this.configService.get<string>(
        'ADMIN_PASSWORD',
        'root123',
      );
      const password = await bcrypt.hash(adminPassword, rounds);
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
