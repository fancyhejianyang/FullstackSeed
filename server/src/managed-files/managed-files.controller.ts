import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import {
  CleanupManagedFilesDto,
  CleanupPreviewDto,
} from './dto/managed-file.dto';
import { ManagedFilesService } from './managed-files.service';

@ApiTags('MediaStorage')
@ApiBearerAuth()
@Controller('media-storage')
export class ManagedFilesController {
  constructor(private readonly service: ManagedFilesService) {}

  @Get('cleanup-preview')
  @RequirePermissions('MediaStorage.read')
  @ApiOperation({ summary: '预览可安全清理的受管文件' })
  preview(@Query() query: CleanupPreviewDto) {
    return this.service.cleanupPreview(query.scope, query.limit);
  }

  @Post('cleanup')
  @RequirePermissions('MediaStorage.update')
  @ApiOperation({ summary: '按预览文件 ID 精确清理受管文件' })
  cleanup(@Body() dto: CleanupManagedFilesDto) {
    return this.service.cleanup(dto.fileIds, dto.scope);
  }
}
