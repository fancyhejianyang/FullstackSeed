import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import type { ExternalApp } from '../external-apps/entities/external-app.entity';
import { AppIdGuard } from '../external-apps/guards/app-id.guard';
import {
  AskKnowledgeAiDto,
  InitKnowledgeAiChatSessionDto,
} from '../knowledge-ai-chat/dto/knowledge-ai-chat.dto';
import { CustomerServiceService } from './customer-service.service';
import {
  prepareCustomerStream,
  writeCustomerEvent,
} from './customer-service.controller';

/** 保留原 URL，但所有访客问答都必须经过同一个并发调度器。 */
@ApiTags('KnowledgeAiChat')
@Controller('knowledge-ai-chat')
export class LegacyKnowledgeAiChatController {
  constructor(private readonly service: CustomerServiceService) {}

  @Post('sessions/init')
  @Public()
  @UseGuards(AppIdGuard)
  @ApiOperation({ summary: '兼容入口：初始化客服会话并签发凭证' })
  init(
    @Body() dto: InitKnowledgeAiChatSessionDto,
    @Req() req: Request & { externalApp: ExternalApp },
  ) {
    return this.service.initSession(req.externalApp, dto);
  }

  @Post('ask/stream')
  @Public()
  @UseGuards(AppIdGuard)
  @ApiOperation({
    summary: '兼容入口：经应用并发调度后流式回答（须提供会话凭证和请求标识）',
  })
  async ask(
    @Body() dto: AskKnowledgeAiDto,
    @Req() req: Request & { externalApp: ExternalApp },
    @Res() res: Response,
  ) {
    if (!dto.sessionId || !dto.clientMessageId)
      throw new BadRequestException(
        '请先初始化会话，并提供 sessionId、会话凭证及 clientMessageId',
      );
    const sessionId = dto.sessionId;
    const clientMessageId = dto.clientMessageId;
    await this.service.assertVisitor(
      sessionId,
      req.externalApp,
      req.headers['x-session-token'],
    );
    const initial = await this.service.submitVisitorMessage(
      sessionId,
      req.externalApp,
      { clientMessageId, content: dto.question },
    );
    const requestTask = await this.service.findTaskForMessage(
      sessionId,
      clientMessageId,
    );
    prepareCustomerStream(res);
    let finished = false;
    let checking = false;
    let cleanup: (() => void) | undefined;
    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup?.();
      res.end();
    };
    res.once('close', () => {
      finished = true;
      cleanup?.();
    });
    const check = async () => {
      if (finished || checking) return;
      checking = true;
      try {
        const snapshot = await this.service.getSnapshot(sessionId);
        if (snapshot.serviceStatus !== 'ai') {
          writeCustomerEvent(res, 'handoff', {
            serviceStatus: snapshot.serviceStatus,
          });
          finish();
          return;
        }
        const task = await this.service.findTaskForMessage(
          sessionId,
          clientMessageId,
        );
        if (!task || ['queued', 'running', 'cancelling'].includes(task.status))
          return;
        if (task.status === 'completed') {
          writeCustomerEvent(res, 'done', {
            sessionId,
            messageId: task.aiMessageId,
            answer: task.answer,
            isSuccess: true,
          });
        } else {
          writeCustomerEvent(
            res,
            task.status === 'cancelled' ? 'cancelled' : 'error',
            {
              message:
                task.status === 'cancelled'
                  ? '本次 AI 问答已取消'
                  : '本次 AI 问答未完成，请重试或转人工',
            },
          );
        }
        finish();
      } catch {
        writeCustomerEvent(res, 'error', {
          message: '会话同步失败，请重新连接',
        });
        finish();
      } finally {
        checking = false;
      }
    };
    writeCustomerEvent(res, 'snapshot', initial);
    cleanup = this.service.subscribe(
      sessionId,
      (event, data) => {
        if (finished) return;
        if (event === 'ai-event') {
          const payload = data as {
            taskId: number;
            event: string;
            data: unknown;
          };
          if (
            payload.taskId === requestTask?.id &&
            payload.event !== 'task-settled'
          )
            writeCustomerEvent(res, payload.event, payload.data);
        } else writeCustomerEvent(res, event, data);
        if (event === 'snapshot' || event === 'ai-event') void check();
      },
      finish,
    );
    if (finished) cleanup();
    void check();
  }
}
