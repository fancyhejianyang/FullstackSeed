import { Type } from 'class-transformer';
import { IsArray, IsInt, IsIn, IsOptional, Max, Min } from 'class-validator';

export class CleanupPreviewDto {
  @IsIn(['ai-materials', 'comfyui'])
  @IsOptional()
  scope?: string = 'ai-materials';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  limit?: number = 100;
}

export class CleanupManagedFilesDto {
  @IsIn(['ai-materials', 'comfyui'])
  @IsOptional()
  scope?: string = 'ai-materials';

  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  fileIds: number[];
}
