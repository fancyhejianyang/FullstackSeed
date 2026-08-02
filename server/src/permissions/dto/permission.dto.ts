import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsInt,
  Matches,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';

export type PermissionType = 'menu' | 'button' | 'api';

export class CreatePermissionDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z][A-Za-z0-9]*$/, {
    message: '权限编码应为基础动作标识，如 read / batchDelete',
  })
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsIn(['menu', 'button', 'api'])
  @IsOptional()
  type?: PermissionType;

}

export class UpdatePermissionDto extends PartialType(CreatePermissionDto) {}

export class QueryPermissionDto {
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
