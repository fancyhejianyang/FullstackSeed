import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import {
  QueryLogRecordDto,
  UpdateLogModuleConfigDto,
} from './dto/log-record.dto';
import { LogRecordsService } from './log-records.service';

@ApiTags('LogRecords')
@ApiBearerAuth()
@Controller('log-records')
export class LogRecordsController {
  constructor(private readonly logRecordsService: LogRecordsService) {}

  @Get()
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '分页查询日志记录' })
  findAll(@Query() query: QueryLogRecordDto) {
    return this.logRecordsService.findAll(query);
  }

  @Get('module-configs')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '日志统计模块配置列表' })
  findModuleConfigs() {
    return this.logRecordsService.findModuleConfigs();
  }

  @Put('module-configs')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '保存日志统计模块配置' })
  updateModuleConfigs(@Body() dto: UpdateLogModuleConfigDto) {
    return this.logRecordsService.updateModuleConfigs(dto.configs);
  }
}
