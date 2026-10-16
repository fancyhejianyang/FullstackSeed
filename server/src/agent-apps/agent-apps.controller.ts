import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { AgentMediaProbeService } from './agent-media-probe.service';
import {
  BatchDeleteAgentAppDto,
  CreateAgentAppDto,
  QueryAgentAppDto,
  QueryAgentExecutionDto,
  UpdateAgentAppDto,
  ProbeAgentMediaModelDto,
} from './dto/agent-app.dto';
import { AgentAppsService } from './agent-apps.service';
import { AgentWorkspaceService } from './agent-workspace.service';

@ApiTags('AgentApps')
@ApiBearerAuth()
@Controller('agent-apps')
export class AgentAppsController {
  constructor(
    private readonly service: AgentAppsService,
    private readonly workspaceService: AgentWorkspaceService,
    private readonly mediaProbeService: AgentMediaProbeService,
  ) {}

  @Get()
  @RequirePermissions('AgentApp.read')
  @ApiOperation({ summary: '分页查询内部 Agent 应用' })
  findAll(@Query() query: QueryAgentAppDto) {
    return this.service.findAll(query);
  }

  @Get('configuration-options')
  @RequirePermissions('AgentApp.read')
  @ApiOperation({ summary: '查询 Agent 配置可选项' })
  getConfigurationOptions() {
    return this.service.getConfigurationOptions();
  }

  @Get('execution-records')
  @RequirePermissions('AgentApp.read')
  @ApiOperation({ summary: '分页查询 Agent 工具执行记录' })
  findExecutionRecords(@Query() query: QueryAgentExecutionDto) {
    return this.workspaceService.findExecutionRecords(query);
  }

  @Post('probe-media-model')
  @RequirePermissions('AgentApp.read')
  @ApiOperation({
    summary: '以图片协议测试模型能力（可能计费，不修改账号目录）',
  })
  probeMediaModel(
    @Body() dto: ProbeAgentMediaModelDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.mediaProbeService.probe(dto, user);
  }

  @Get(':id')
  @RequirePermissions('AgentApp.read')
  @ApiOperation({ summary: '内部 Agent 应用详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('AgentApp.create')
  @ApiOperation({ summary: '创建内部 Agent 应用' })
  create(@Body() dto: CreateAgentAppDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('AgentApp.update')
  @ApiOperation({ summary: '更新内部 Agent 应用' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAgentAppDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('AgentApp.delete')
  @ApiOperation({ summary: '删除内部 Agent 应用' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post('batch-delete')
  @RequirePermissions('AgentApp.batchDelete')
  @ApiOperation({ summary: '批量删除内部 Agent 应用' })
  batchRemove(@Body() dto: BatchDeleteAgentAppDto) {
    return this.service.batchRemove(dto.ids);
  }
}
