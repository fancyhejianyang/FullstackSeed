import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsBoolean,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import type { MenuType } from '../entities/menu.entity';

export class CreateMenuDto {
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  parentId?: number | null;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  path?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  sort?: number;

  @IsIn(['menu', 'button'])
  @IsOptional()
  type?: MenuType;

  @IsString()
  @IsOptional()
  permissionCode?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateMenuDto extends PartialType(CreateMenuDto) {}
