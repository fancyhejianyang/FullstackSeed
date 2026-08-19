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
import { AiFeatureConfigsService } from './ai-feature-configs.service';
import {
  BatchDeleteAiFeatureConfigDto,
  CreateAiFeatureConfigDto,
  QueryAiFeatureConfigDto,
  UpdateAiFeatureConfigDto,
} from './dto/ai-feature-config.dto';

@ApiTags('AiFeatureConfig')
@ApiBearerAuth()
@Controller('ai-feature-configs')
export class AiFeatureConfigsController {
  constructor(private readonly configsService: AiFeatureConfigsService) {}

  @Get()
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '分页查询 AI 功能配置' })
  findAll(@Query() query: QueryAiFeatureConfigDto) {
    return this.configsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: 'AI 功能配置详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.configsService.findOne(id);
  }

  @Post()
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '创建 AI 功能配置' })
  create(@Body() dto: CreateAiFeatureConfigDto) {
    return this.configsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '更新 AI 功能配置' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAiFeatureConfigDto,
  ) {
    return this.configsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '删除 AI 功能配置' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.configsService.remove(id);
  }

  @Post('batch-delete')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '批量删除 AI 功能配置' })
  batchRemove(@Body() dto: BatchDeleteAiFeatureConfigDto) {
    return this.configsService.batchRemove(dto.ids);
  }
}

