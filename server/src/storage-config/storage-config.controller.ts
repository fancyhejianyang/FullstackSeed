import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { UpdateStorageConfigDto } from './dto/storage-config.dto';
import { StorageConfigService } from './storage-config.service';

@ApiTags('StorageConfig')
@ApiBearerAuth()
@Controller('storage-config')
export class StorageConfigController {
  constructor(private readonly storageConfigService: StorageConfigService) {}

  @Get()
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '获取 OSS/CDN 存储配置' })
  getConfig() {
    return this.storageConfigService.getConfig();
  }

  @Put()
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '保存 OSS/CDN 存储配置' })
  updateConfig(@Body() dto: UpdateStorageConfigDto) {
    return this.storageConfigService.updateConfig(dto);
  }
}
