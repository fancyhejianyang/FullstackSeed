import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import type { ExternalApp } from '../external-apps/entities/external-app.entity';
import { AppIdGuard } from '../external-apps/guards/app-id.guard';
import { InitKnowledgeAiChatSessionDto } from '../knowledge-ai-chat/dto/knowledge-ai-chat.dto';
import { CustomerServiceService } from './customer-service.service';
import {
  CustomerHistoryQueryDto,
  QueryCustomerSessionsDto,
  SendCustomerMessageDto,
} from './dto/customer-service.dto';

type AppRequest = Request & { externalApp: ExternalApp };

export function prepareCustomerStream(res: Response) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

export function writeCustomerEvent(
  res: Response,
  event: string,
  data: unknown,
) {
  if (!res.destroyed && !res.writableEnded)
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

@ApiTags('CustomerService')
@Controller('customer-service')
export class CustomerServiceController {
  constructor(private readonly service: CustomerServiceService) {}

  @Post('sessions/init')
  @Public()
  @UseGuards(AppIdGuard)
  @ApiOperation({ summary: '初始化带归属凭证的客服会话' })
  init(@Body() dto: InitKnowledgeAiChatSessionDto, @Req() req: AppRequest) {
    return this.service.initSession(req.externalApp, dto);
  }

  @Get('sessions/:id')
  @Public()
  @UseGuards(AppIdGuard)
  @ApiOperation({ summary: '访客读取会话和分页历史' })
  async snapshot(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: CustomerHistoryQueryDto,
    @Req() req: AppRequest,
  ) {
    await this.visitor(id, req);
    return this.service.getSnapshot(id, query.beforeMessageId);
  }

  @Post('sessions/:id/messages')
  @Public()
  @UseGuards(AppIdGuard)
  @ApiOperation({ summary: '访客发送消息，AI 满额时排队' })
  async send(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendCustomerMessageDto,
    @Req() req: AppRequest,
  ) {
    await this.visitor(id, req);
    return this.service.submitVisitorMessage(id, req.externalApp, dto);
  }

  @Post('sessions/:id/handoff')
  @Public()
  @UseGuards(AppIdGuard)
  @ApiOperation({ summary: '访客申请转人工并撤销 AI 任务' })
  async handoff(@Param('id', ParseIntPipe) id: number, @Req() req: AppRequest) {
    await this.visitor(id, req);
    return this.service.requestHuman(id, req.externalApp);
  }

  @Post('sessions/:id/resume-ai')
  @Public()
  @UseGuards(AppIdGuard)
  @ApiOperation({ summary: '等待人工时取消申请，返回 AI，不重放旧消息' })
  async resume(@Param('id', ParseIntPipe) id: number, @Req() req: AppRequest) {
    await this.visitor(id, req);
    return this.service.resumeAi(id, req.externalApp);
  }

  @Post('sessions/:id/cancel')
  @Public()
  @UseGuards(AppIdGuard)
  @ApiOperation({ summary: '取消排队或处理中 AI 任务' })
  async cancel(@Param('id', ParseIntPipe) id: number, @Req() req: AppRequest) {
    await this.visitor(id, req);
    return this.service.cancelVisitorTask(id, req.externalApp);
  }

  @Get('sessions/:id/events')
  @Public()
  @UseGuards(AppIdGuard)
  @ApiOperation({ summary: '订阅访客会话状态、AI 片段及人工消息' })
  async events(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AppRequest,
    @Res() res: Response,
  ) {
    await this.visitor(id, req);
    await this.service.getSnapshot(id);
    this.openStream(id, res);
  }

  @Get('admin/apps')
  @ApiBearerAuth()
  @RequirePermissions('CustomerService.read')
  @ApiOperation({ summary: '客服可见的应用筛选项（仅 ID 和名称）' })
  apps() {
    return this.service.findApps();
  }

  @Get('admin/sessions')
  @ApiBearerAuth()
  @RequirePermissions('CustomerService.read')
  @ApiOperation({ summary: '客服工作台分页会话列表' })
  findAll(
    @Query() query: QueryCustomerSessionsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findSessions(query, user);
  }

  @Get('admin/sessions/:id')
  @ApiBearerAuth()
  @RequirePermissions('CustomerService.read')
  @ApiOperation({ summary: '客服读取会话及历史' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: CustomerHistoryQueryDto,
  ) {
    return this.service.getSnapshot(id, query.beforeMessageId);
  }

  @Get('admin/sessions/:id/events')
  @ApiBearerAuth()
  @RequirePermissions('CustomerService.read')
  @ApiOperation({ summary: '客服订阅会话变化' })
  async adminEvents(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    await this.service.getSnapshot(id);
    this.openStream(id, res);
  }

  @Post('admin/sessions/:id/claim')
  @ApiBearerAuth()
  @RequirePermissions('CustomerService.update')
  @ApiOperation({ summary: '客服主动接手会话，原子取消 AI 排队或执行' })
  claim(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.claimSession(id, user);
  }

  @Post('admin/sessions/:id/messages')
  @ApiBearerAuth()
  @RequirePermissions('CustomerService.create')
  @ApiOperation({ summary: '当前接待客服发送文本消息' })
  agentSend(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendCustomerMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.sendAgentMessage(id, dto, user);
  }

  @Post('admin/sessions/:id/close')
  @ApiBearerAuth()
  @RequirePermissions('CustomerService.update')
  @ApiOperation({ summary: '当前接待客服结束会话' })
  close(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.closeSession(id, user);
  }

  private visitor(id: number, req: AppRequest) {
    return this.service.assertVisitor(
      id,
      req.externalApp,
      req.headers['x-session-token'],
    );
  }

  private openStream(id: number, res: Response) {
    prepareCustomerStream(res);
    const cleanup = this.service.subscribe(
      id,
      (event, data) => writeCustomerEvent(res, event, data),
      () => res.end(),
    );
    res.once('close', cleanup);
  }
}
