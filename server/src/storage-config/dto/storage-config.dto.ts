import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export type StorageProvider = 'local' | 'aliyun-oss' | 'tencent-cos' | 'qiniu';

export class UpdateStorageConfigDto {
  @IsBoolean()
  enabled: boolean;

  @IsIn(['local', 'aliyun-oss', 'tencent-cos', 'qiniu'])
  provider: StorageProvider;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  publicBaseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bucket?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  endpoint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  accessKeyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  accessKeySecret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  uploadDir?: string;
}
