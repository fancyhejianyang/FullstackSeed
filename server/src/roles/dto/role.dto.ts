import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsArray,
  Min,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import { toBoolLike } from '../../common/utils/bool-like';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @Transform(({ value }) => toBoolLike(value))
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsNotEmpty()
  @IsOptional()
  isActive?: boolean;

  // 关联的权限点 id 列表
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  permissionIds?: number[];

  // 角色最终授权结果：菜单模块 + 基础权限动作组合后的完整权限码（如 Role.read / Role.update）。
  @IsArray()
  @IsString({ each: true })
  @Matches(/^[A-Z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*$/, {
    each: true,
    message: '角色权限码应为 Module.action 格式，如 Role.read',
  })
  @IsOptional()
  permissionCodes?: string[];
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}

export class QueryRoleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  pageSize?: number = 10;

  @IsString()
  @IsOptional()
  keyword?: string;
}
