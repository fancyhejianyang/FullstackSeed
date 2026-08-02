import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ModuleModelsService } from './module-models.service';

@ApiTags('ModuleModels')
@ApiBearerAuth()
@Controller('module-models')
export class ModuleModelsController {
  constructor(private readonly moduleModelsService: ModuleModelsService) {}

  @Get()
  @ApiOperation({ summary: '模块模型列表' })
  findAll() {
    return this.moduleModelsService.findAll();
  }

  @Get(':moduleId')
  @ApiOperation({ summary: '模块模型详情' })
  @ApiParam({ name: 'moduleId', description: '模块 ID，如 user/demo' })
  findOne(@Param('moduleId') moduleId: string) {
    return this.moduleModelsService.findOne(moduleId);
  }

  @Get(':moduleId/fields')
  @ApiOperation({ summary: '指定模块的模型字段列表' })
  @ApiParam({ name: 'moduleId', description: '模块 ID，如 user/demo' })
  findFields(@Param('moduleId') moduleId: string) {
    return this.moduleModelsService.findFields(moduleId);
  }
}
