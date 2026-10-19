import {
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { AiMaterialsService } from './ai-materials.service';
import { QueryMaterialTaskDto } from './dto/ai-material.dto';

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
