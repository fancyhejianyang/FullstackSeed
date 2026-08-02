import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/entities/user.entity';
import { Menu } from '../menus/entities/menu.entity';

export interface SafeUser {
  id: number;
  username: string;
  nickname: string;
  isAdmin: boolean;
  roles: string[];
  permissions: string[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectRepository(Menu)
    private readonly menuRepository: Repository<Menu>,
  ) {}

  private getMenuModule(menu: Menu | undefined): string | null {
    if (!menu) return null;
    const code = menu.permissionCode
      ?.split(',')
      .map((item) => item.trim())
      .find((item) => item.includes('.'));
    if (code) return code.split('.')[0];

    const pathSegment = menu.path?.split('/').filter(Boolean)[0] ?? '';
    const moduleMap: Record<string, string> = {
      demo: 'Demo',
      users: 'User',
      roles: 'Role',
      permissions: 'Permission',
      menus: 'Menu',
      'system-config': 'Menu',
    };
    if (moduleMap[pathSegment]) return moduleMap[pathSegment];
    if (!pathSegment) return null;

    const normalized = pathSegment.replace(/-([a-z])/g, (_, char: string) =>
      char.toUpperCase(),
    );
    const singular = normalized.endsWith('s')
      ? normalized.slice(0, -1)
      : normalized;
    return singular.charAt(0).toUpperCase() + singular.slice(1);
  }

  /**
   * 扁平化用户的角色编码与权限编码（去重）。
   * 权限同时保留纯动作码（read/create）和菜单归属推导出的模块权限码（Role.read）。
   */
  private async flattenRbac(user: User): Promise<{
    roles: string[];
    permissions: string[];
  }> {
    const roles = (user.roles ?? []).map((role) => role.code);
    const rolePermissions = (user.roles ?? []).flatMap(
      (role) => role.permissions ?? [],
    );
    const menuIds = Array.from(
      new Set(
        rolePermissions
          .map((permission) => permission.menuId)
          .filter((id): id is number => id != null),
      ),
    );
    const menus = menuIds.length
      ? await this.menuRepository.findBy({ id: In(menuIds) })
      : [];
    const menuMap = new Map(menus.map((menu) => [menu.id, menu]));
    const permissions = new Set<string>();

    rolePermissions.forEach((permission) => {
      permissions.add(permission.code);
      if (permission.code.includes('.')) {
        return;
      }
      const moduleName = this.getMenuModule(
        permission.menuId == null ? undefined : menuMap.get(permission.menuId),
      );
      if (moduleName) {
        permissions.add(`${moduleName}.${permission.code}`);
      }
    });

    return { roles, permissions: Array.from(permissions) };
  }

  /**
   * 登录：校验用户名密码，签发携带 roles/permissions 的 access_token
   */
  async login(loginDto: LoginDto) {
    const user = await this.usersService.findOneByUsername(loginDto.username);
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    if (user.isActive === false) {
      throw new UnauthorizedException('账号已被禁用');
    }
    const matched = await bcrypt.compare(loginDto.password, user.password);
    if (!matched) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const { roles, permissions } = await this.flattenRbac(user);
    const isAdmin = !!user.isAdmin;
    const safeUser: SafeUser = {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      isAdmin,
      roles,
      permissions,
    };
    const access_token = this.jwtService.sign({
      sub: user.id,
      username: user.username,
      isAdmin,
      roles,
      permissions,
    });

    return { access_token, user: safeUser };
  }

  /**
   * 获取当前用户信息（含 roles/permissions）
   */
  async getProfile(userId: number): Promise<SafeUser> {
    const user = await this.usersService.findOneById(userId);
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }
    if (user.isActive === false) {
      throw new UnauthorizedException('账号已被禁用');
    }
    const { roles, permissions } = await this.flattenRbac(user);
    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      isAdmin: !!user.isAdmin,
      roles,
      permissions,
    };
  }
}
