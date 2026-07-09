import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface JwtPayload {
  sub: number;
  username: string;
  isAdmin?: boolean;
  roles: string[];
  permissions: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    const options: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') || 'fullstack_seed_secret',
    };
    super(options);
  }

  validate(payload: JwtPayload) {
    // 返回值会挂载到 request.user（与 AuthUser 类型对齐）
    return {
      userId: payload.sub,
      username: payload.username,
      isAdmin: payload.isAdmin ?? false,
      roles: payload.roles ?? [],
      permissions: payload.permissions ?? [],
    };
  }
}
