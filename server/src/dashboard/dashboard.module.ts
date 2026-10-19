import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardConfig } from './entities/dashboard-config.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardConfigService } from './dashboard-config.service';
@Module({
  imports: [TypeOrmModule.forFeature([DashboardConfig])],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardConfigService],
})
export class DashboardModule {}
