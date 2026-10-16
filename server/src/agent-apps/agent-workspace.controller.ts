import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AGENT_UPLOAD_LIMIT } from './agent-image-utils';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import {
  ConfirmAgentDraftDto,
  CreateAgentSessionDto,
  QueryAgentSessionDto,
  SendAgentMessageDto,
  UpdateAgentDraftDto,
} from './dto/agent-app.dto';
import { AgentWorkspaceService } from './agent-workspace.service';

@ApiTags('AgentWorkspace')
@ApiBearerAuth()
@RequirePermissions('AgentWorkspace.read')
@Controller('agent-workspace')
export class AgentWorkspaceController {
  constructor(private readonly service: AgentWorkspaceService) {}

  @Get('apps')
  @ApiOperation({ summary: '查询当前员工可使用的 Agent' })
  findAvailableApps(@CurrentUser() user: AuthUser) {
    return this.service.findAvailableApps(user);
  }

  @Get('sessions')
  @ApiOperation({ summary: '查询当前员工的 Agent 会话' })
  findSessions(
    @Query() query: QueryAgentSessionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findSessions(query, user);
  }

  @Post('sessions')
  @ApiOperation({ summary: '新建 Agent 会话' })
  createSession(
    @Body() dto: CreateAgentSessionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createSession(dto, user);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: '读取本人 Agent 会话详情' })
  findSession(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findSession(id, user);
  }

  @Post('sessions/:id/messages')
  @ApiOperation({ summary: '发送消息并执行结构化 Agent 动作' })
  sendMessage(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendAgentMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.sendMessage(id, dto, user);
  }

  @Post('sessions/:id/images')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: AGENT_UPLOAD_LIMIT, files: 1 },
    }),
  )
  @ApiOperation({
    summary: '上传本人会话的私有识别图片（PNG/JPEG/WebP，5 MB）',
  })
  uploadImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.uploadImage(id, file?.buffer, user);
  }

  @Get('sessions/:id/images/:imageId')
  @ApiOperation({ summary: '经会话鉴权读取私有图片' })
  async readImage(
    @Param('id', ParseIntPipe) id: number,
    @Param('imageId', ParseIntPipe) imageId: number,
    @CurrentUser() user: AuthUser,
    @Res() response: Response,
  ) {
    const image = await this.service.readImage(id, imageId, user);
    response.set({
      'Content-Type': image.mimeType,
      'Content-Length': String(image.size),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.send(image.data);
  }

  @Patch('drafts/:id')
  @ApiOperation({ summary: '按版本修改本人录入草稿' })
  updateDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAgentDraftDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateDraft(id, dto, user);
  }

  @Post('drafts/:id/confirm')
  @ApiOperation({ summary: '确认并幂等提交本人录入草稿' })
  confirmDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmAgentDraftDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.confirmDraft(id, dto, user);
  }

  @Post('drafts/:id/cancel')
  @ApiOperation({ summary: '取消本人尚未提交的录入草稿' })
  cancelDraft(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.cancelDraft(id, user);
  }

  @Get('executions/request/:requestId')
  @ApiOperation({ summary: '按幂等请求号核实执行结果' })
  findExecutionByRequest(
    @Param('requestId') requestId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findExecutionByRequest(requestId, user);
  }

  @Get('executions/progress/:requestId')
  @ApiOperation({ summary: '只读查询本人消息执行阶段，未建立记录返回 null' })
  findExecutionProgress(
    @Param('requestId') requestId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findExecutionProgress(requestId, user);
  }

  @Get('executions/:id')
  @ApiOperation({ summary: '查询本人执行记录' })
  findExecution(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findExecution(id, user);
  }

  @Post('executions/:id/stop')
  @ApiOperation({ summary: '停止本人尚未完成的动作' })
  stopExecution(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.stopExecution(id, user);
  }
}
