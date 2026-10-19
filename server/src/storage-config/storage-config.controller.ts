import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { UpdateStorageConfigDto } from './dto/storage-config.dto';
import {
  StorageConfigService,
  publicStorageConfig,
} from './storage-config.service';

@ApiTags('StorageConfig')
@ApiBearerAuth()
@Controller('storage-config')
export class StorageConfigController {
  constructor(private readonly storageConfigService: StorageConfigService) {}

  @Get()
  @RequirePermissions('StorageConfig.read')
  @ApiOperation({ summary: '获取 OSS/CDN 存储配置' })
  async getConfig() {
    return publicStorageConfig(await this.storageConfigService.getConfig());
  }

  @Put()
  @RequirePermissions('StorageConfig.update')
  @ApiOperation({ summary: '保存 OSS/CDN 存储配置' })
  async updateConfig(@Body() dto: UpdateStorageConfigDto) {
    return publicStorageConfig(
      await this.storageConfigService.updateConfig(dto),
    );
  }
}
