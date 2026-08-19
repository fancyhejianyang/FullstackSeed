import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalAppsController } from './external-apps.controller';
import { ExternalAppsService } from './external-apps.service';
import { ExternalApp } from './entities/external-app.entity';
import { AppIdGuard } from './guards/app-id.guard';

@Module({
  imports: [TypeOrmModule.forFeature([ExternalApp])],
  controllers: [ExternalAppsController],
  providers: [ExternalAppsService, AppIdGuard],
  exports: [ExternalAppsService, AppIdGuard],
})
export class ExternalAppsModule {}
