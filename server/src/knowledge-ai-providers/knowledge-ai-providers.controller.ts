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
  BatchDeleteKnowledgeAiProviderDto,
  CreateKnowledgeAiProviderDto,
  QueryKnowledgeAiProviderDto,
  TestKnowledgeAiProviderDto,
  UpdateKnowledgeAiProviderDto,
} from './dto/knowledge-ai-provider.dto';
import { KnowledgeAiProvidersService } from './knowledge-ai-providers.service';

@ApiTags('KnowledgeAiProvider')
@ApiBearerAuth()
@Controller('knowledge-ai-providers')
export class KnowledgeAiProvidersController {
  constructor(
    private readonly knowledgeAiProvidersService: KnowledgeAiProvidersService,
  ) {}

  @Get()
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '分页查询大模型账号' })
  findAll(@Query() query: QueryKnowledgeAiProviderDto) {
    return this.knowledgeAiProvidersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '大模型账号详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.knowledgeAiProvidersService.findOne(id);
  }

  @Post()
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '创建大模型账号' })
  create(@Body() dto: CreateKnowledgeAiProviderDto) {
    return this.knowledgeAiProvidersService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '更新大模型账号' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateKnowledgeAiProviderDto,
  ) {
    return this.knowledgeAiProvidersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '删除大模型账号' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.knowledgeAiProvidersService.remove(id);
  }

  @Post('batch-delete')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '批量删除大模型账号' })
  batchRemove(@Body() dto: BatchDeleteKnowledgeAiProviderDto) {
    return this.knowledgeAiProvidersService.batchRemove(dto.ids);
  }

  @Post('test')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '测试大模型账号调用' })
  test(@Body() dto: TestKnowledgeAiProviderDto) {
    return this.knowledgeAiProvidersService.test(dto);
  }
}
