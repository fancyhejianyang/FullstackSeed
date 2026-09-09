import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Body,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import {
  QueryAiCommandDefinitionDto,
  UpdateAiCommandDefinitionDto,
} from './dto/ai-command-definition.dto';
import { AiCommandDefinitionsService } from './ai-command-definitions.service';

@ApiTags('AiCommandDefinition')
@ApiBearerAuth()
@Controller('ai-command-definitions')
export class AiCommandDefinitionsController {
  constructor(
    private readonly definitionsService: AiCommandDefinitionsService,
  ) {}

  @Get()
  @RequirePermissions('AiCommandDefinition.read')
  @ApiOperation({ summary: '分页查询 AI 指令集' })
  findAll(@Query() query: QueryAiCommandDefinitionDto) {
    return this.definitionsService.findAll(query);
  }

  @Get('catalog')
  @RequirePermissions('AiCommandDefinition.read')
  @ApiOperation({ summary: '查询系统指令白名单目录' })
  getCatalog() {
    return this.definitionsService.getCatalog();
  }

  @Get(':id')
  @RequirePermissions('AiCommandDefinition.read')
  @ApiOperation({ summary: '查询 AI 指令详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.definitionsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('AiCommandDefinition.update')
  @ApiOperation({ summary: '更新 AI 指令管理配置' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAiCommandDefinitionDto,
  ) {
    return this.definitionsService.update(id, dto);
  }
}
