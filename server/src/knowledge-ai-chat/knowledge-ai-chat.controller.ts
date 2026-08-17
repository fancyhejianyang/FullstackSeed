import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import {
  AskKnowledgeAiDto,
  BatchDeleteKnowledgeAiChatSessionDto,
  QueryKnowledgeAiChatSessionDto,
} from './dto/knowledge-ai-chat.dto';
import { KnowledgeAiChatService } from './knowledge-ai-chat.service';

@ApiTags('KnowledgeAiChat')
@ApiBearerAuth()
@Controller('knowledge-ai-chat')
export class KnowledgeAiChatController {
  constructor(private readonly knowledgeAiChatService: KnowledgeAiChatService) {}

  @Get('sessions')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '分页查询问答会话记录' })
  findSessions(@Query() query: QueryKnowledgeAiChatSessionDto) {
    return this.knowledgeAiChatService.findSessions(query);
  }

  @Get('sessions/:id')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '问答会话详情' })
  findSession(@Param('id', ParseIntPipe) id: number) {
    return this.knowledgeAiChatService.findSession(id);
  }

  @Post('ask')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '发送问题并记录问答内容' })
  ask(@Body() dto: AskKnowledgeAiDto) {
    return this.knowledgeAiChatService.ask(dto);
  }

  @Delete('sessions/:id')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '删除问答会话记录' })
  removeSession(@Param('id', ParseIntPipe) id: number) {
    return this.knowledgeAiChatService.removeSession(id);
  }

  @Post('sessions/batch-delete')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '批量删除问答会话记录' })
  batchRemoveSessions(@Body() dto: BatchDeleteKnowledgeAiChatSessionDto) {
    return this.knowledgeAiChatService.batchRemoveSessions(dto.ids);
  }
}
