import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { AiMaterialsService } from './ai-materials.service';
import {
  BatchDeleteAiMaterialDto,
  CreateAiMaterialDto,
  GenerateAiMaterialDto,
  QueryAiMaterialDto,
  QueryMaterialTaskDto,
  UpdateAiMaterialDto,
} from './dto/ai-material.dto';

@ApiTags('AiMaterial')
@ApiBearerAuth()
@Controller('ai-materials')
export class AiMaterialsController {
  constructor(private readonly service: AiMaterialsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('AiMaterial.read')
  findAll(
    @Query() query: QueryAiMaterialDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.findAll(query, userId);
  }

  @Get('config-options')
  @RequirePermissions('AiMaterial.read')
  @ApiOperation({ summary: '启用的图片生成配置选项' })
  configOptions(@Query() query: QueryAiMaterialDto) {
    return this.service.configOptions(query);
  }

  @Post('batch-delete')
  @RequirePermissions('AiMaterial.batchDelete')
  batchRemove(
    @Body() dto: BatchDeleteAiMaterialDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.batchRemove(dto, userId);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('AiMaterial.read')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.findOne(id, userId);
  }

  @Post()
  @RequirePermissions('AiMaterial.create')
  create(
    @Body() dto: CreateAiMaterialDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions('AiMaterial.update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAiMaterialDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions('AiMaterial.delete')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.remove(id, userId);
  }

  @Post(':id/generate')
  @RequirePermissions('AiMaterial.update')
  generate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GenerateAiMaterialDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.submit(id, dto, userId);
  }
}

@ApiTags('MaterialGenerationTask')
@ApiBearerAuth()
@Controller('material-generation-tasks')
export class MaterialGenerationTasksController {
  constructor(private readonly service: AiMaterialsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('AiMaterial.read')
  list(
    @Query() query: QueryMaterialTaskDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.listTasks(query, userId);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('AiMaterial.read')
  detail(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.taskDetail(id, userId);
  }
}
