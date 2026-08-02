import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsIn,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import type { MenuType } from '../entities/menu.entity';
import { toBoolLike } from '../../common/utils/bool-like';

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

  @Transform(({ value }) => toBoolLike(value))
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsNotEmpty()
  @IsOptional()
  isSystem?: boolean;

  @Transform(({ value }) => toBoolLike(value))
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsNotEmpty()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateMenuDto extends PartialType(CreateMenuDto) {}
