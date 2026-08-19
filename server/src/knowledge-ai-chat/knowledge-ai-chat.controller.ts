import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { AppIdGuard } from '../external-apps/guards/app-id.guard';
import {
  AskKnowledgeAiDto,
  BatchDeleteKnowledgeAiChatSessionDto,
  InitKnowledgeAiChatSessionDto,
  QueryKnowledgeAiChatSessionDto,
} from './dto/knowledge-ai-chat.dto';
import { KnowledgeAiChatService } from './knowledge-ai-chat.service';

@ApiTags('KnowledgeAiChat')
@Controller('knowledge-ai-chat')
export class KnowledgeAiChatController {
  constructor(private readonly knowledgeAiChatService: KnowledgeAiChatService) {}

  @Get('sessions')
  @ApiBearerAuth()
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '分页查询问答会话记录' })
  findSessions(@Query() query: QueryKnowledgeAiChatSessionDto) {
    return this.knowledgeAiChatService.findSessions(query);
  }

  @Get('sessions/:id')
  @ApiBearerAuth()
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '问答会话详情' })
  findSession(@Param('id', ParseIntPipe) id: number) {
    return this.knowledgeAiChatService.findSession(id);
  }

  @Post('sessions/init')
  @Public()
  @UseGuards(AppIdGuard)
  @ApiOperation({ summary: '应用端初始化 AI 问答会话' })
  initSession(@Body() dto: InitKnowledgeAiChatSessionDto) {
    return this.knowledgeAiChatService.initSession(dto);
  }

  @Post('ask')
  @ApiBearerAuth()
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '发送问题并记录问答内容' })
  ask(@Body() dto: AskKnowledgeAiDto) {
    return this.knowledgeAiChatService.ask(dto);
  }

  @Post('ask/stream')
  @Public()
  @UseGuards(AppIdGuard)
  @ApiOperation({ summary: '发送问题并流式返回 AI 回答' })
  async askStream(@Body() dto: AskKnowledgeAiDto, @Res() res: Response) {
    this.prepareStreamResponse(res);
    const writeEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      await this.knowledgeAiChatService.askStream(dto, { writeEvent });
    } catch (error) {
      writeEvent('error', {
        message: error instanceof Error ? error.message : 'AI 流式调用失败',
      });
    } finally {
      res.end();
    }
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '删除问答会话记录' })
  removeSession(@Param('id', ParseIntPipe) id: number) {
    return this.knowledgeAiChatService.removeSession(id);
  }

  @Post('sessions/batch-delete')
  @ApiBearerAuth()
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '批量删除问答会话记录' })
  batchRemoveSessions(@Body() dto: BatchDeleteKnowledgeAiChatSessionDto) {
    return this.knowledgeAiChatService.batchRemoveSessions(dto.ids);
  }

  private prepareStreamResponse(res: Response) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
  }
}
