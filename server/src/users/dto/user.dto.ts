import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  MinLength,
  IsArray,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';

function toBoolean(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 1 || value === '1' || value === 'true') {
    return true;
  }
  if (value === false || value === 0 || value === '0' || value === 'false') {
    return false;
  }
  return value;
}

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

  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
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
