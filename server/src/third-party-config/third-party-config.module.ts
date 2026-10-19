import { Module } from '@nestjs/common';
import { StorageConfigModule } from '../storage-config/storage-config.module';
import { ThirdPartyConfigController } from './third-party-config.controller';
import { ThirdPartyConfigService } from './third-party-config.service';
// 按 demo 模块结构接入；只读聚合已有配置，不新建第二套配置存储。
@Module({
  imports: [StorageConfigModule],
  controllers: [ThirdPartyConfigController],
  providers: [ThirdPartyConfigService],
})
export class ThirdPartyConfigModule {}
