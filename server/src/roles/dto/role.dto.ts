import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsArray,
  IsBoolean,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  // 关联的权限点 id 列表
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  permissionIds?: number[];

  // 关联的权限编码列表（如 Role.read / Role.update），用于菜单权限树提交
  @IsArray()
  @IsString({ each: true })
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
