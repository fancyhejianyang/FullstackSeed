import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  MinLength,
  IsArray,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import { toBoolLike } from '../../common/utils/bool-like';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @IsOptional()
  nickname?: string;

  @Transform(({ value }) => toBoolLike(value))
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsNotEmpty()
  @IsOptional()
  isActive?: boolean;

  @Transform(({ value }) => toBoolLike(value))
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsNotEmpty()
  @IsOptional()
  isAdmin?: boolean;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  roleIds?: number[];
}

// 更新：密码可选（不传则不改），其余继承
export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class QueryUserDto {
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
