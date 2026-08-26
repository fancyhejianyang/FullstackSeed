import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/entities/user.entity';

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
  ) {}

  /**
   * 扁平化用户的角色编码与完整权限编码（去重）。
   * 完整权限来自 roles.permissionCodes，格式为 Menu.action / Module.action。
   */
  private flattenRbac(user: User): {
    roles: string[];
    permissions: string[];
  } {
    const roles = (user.roles ?? []).map((role) => role.code);
    const permissions = Array.from(
      new Set((user.roles ?? []).flatMap((role) => role.permissionCodes ?? [])),
    );
    return { roles, permissions };
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

    const { roles, permissions } = this.flattenRbac(user);
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
    const { roles, permissions } = this.flattenRbac(user);
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
