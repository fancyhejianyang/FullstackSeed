import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import * as Joi from 'joi';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { DemoModule } from './demo/demo.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { MenusModule } from './menus/menus.module';

@Module({
  imports: [
    // 配置模块（全局），含 env 校验
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: Joi.object({
        PORT: Joi.number().default(3000),
        DB_HOST: Joi.string().required(),
        DB_PORT: Joi.number().default(3306),
        DB_USER: Joi.string().required(),
        DB_PASS: Joi.string().allow('').required(),
        DB_NAME: Joi.string().required(),
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        JWT_SECRET: Joi.string().default('fullstack_seed_secret'),
        JWT_EXPIRES_IN: Joi.string().default('7d'),
        BCRYPT_SALT_ROUNDS: Joi.number().integer().min(4).max(15).default(10),
      }),
    }),
    // TypeORM 数据库模块
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const host = configService.get<string>('DB_HOST', '127.0.0.1');
        const port = configService.get<number>('DB_PORT', 3306);
        const username = configService.get<string>('DB_USER', 'root');
        const password = configService.get<string>('DB_PASS', '');
        const database = configService.get<string>('DB_NAME', 'fullstack_seed');
        const isProduction =
          configService.get<string>('NODE_ENV', 'development') === 'production';

        // 首次启动自动建库（TypeORM 不会自动创建数据库实例）
        const mysql = require('mysql2/promise');
        const connection = await mysql.createConnection({
          host,
          port,
          user: username,
          password,
        });
        await connection.query(
          `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
        );
        await connection.end();

        return {
          type: 'mysql',
          host,
          port,
          username,
          password,
          database,
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: !isProduction, // 生产环境关闭，避免误改表结构
          driver: require('mysql2'),
          connectorPackage: 'mysql2',
        };
      },
    }),
    UsersModule,
    AuthModule,
    RolesModule,
    PermissionsModule,
    MenusModule,
    DemoModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      // 全局 JWT 守卫（@Public() 接口跳过）—— 先鉴权（是否登录）
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      // 全局权限守卫 —— 后鉴权（是否有权限），@RequirePermissions 标注
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
