import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardConfigService } from './dashboard-config.service';
import { QueryDashboardDto, SaveDashboardDto } from './dto/dashboard.dto';
@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly config: DashboardConfigService,
  ) {}
  @Get('home')
  @ApiOperation({ summary: '当前用户首页：只加载已启用且有权限的板块' })
  home(@CurrentUser() user: AuthUser, @Query() query: QueryDashboardDto) {
    return this.dashboard.home(user, query);
  }
  @Get('config')
  @RequirePermissions('DashboardConfig.read')
  @ApiOperation({ summary: '读取首页配置及注册板块目录' })
  read() {
    return this.config.read();
  }
  @Put('config')
  @RequirePermissions('DashboardConfig.read', 'DashboardConfig.update')
  @ApiOperation({ summary: '保存并立即应用首页配置' })
  save(@Body() dto: SaveDashboardDto, @CurrentUser() user: AuthUser) {
    return this.config.save(dto, user);
  }
}
