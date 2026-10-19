import { Body, Controller, Get, Put, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardConfigService } from './dashboard-config.service';
import {
  DashboardRevisionDto,
  QueryDashboardDto,
  SaveDashboardDto,
} from './dto/dashboard.dto';
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
  @ApiOperation({ summary: '保存首页配置草稿' })
  save(@Body() dto: SaveDashboardDto, @CurrentUser() user: AuthUser) {
    return this.config.change(dto, 'save', user);
  }
  @Post('config/publish')
  @RequirePermissions('DashboardConfig.read', 'DashboardConfig.update')
  @ApiOperation({ summary: '保存并发布首页配置' })
  publish(@Body() dto: SaveDashboardDto, @CurrentUser() user: AuthUser) {
    return this.config.change(dto, 'publish', user);
  }
  @Post('config/rollback')
  @RequirePermissions('DashboardConfig.read', 'DashboardConfig.update')
  @ApiOperation({ summary: '回退到上一个首页配置版本' })
  rollback(@Body() dto: DashboardRevisionDto, @CurrentUser() user: AuthUser) {
    return this.config.change(dto, 'rollback', user);
  }
}
