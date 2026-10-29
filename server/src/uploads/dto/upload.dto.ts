import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UploadUrlDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  url: string;
}

export class DownloadUploadDto extends UploadUrlDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;
}
