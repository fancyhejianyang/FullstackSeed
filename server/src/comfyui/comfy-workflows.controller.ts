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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { ComfyWorkflowsService } from './comfy-workflows.service';
import {
  BatchIdsDto,
  CreateComfyWorkflowDto,
  QueryComfyWorkflowDto,
  UpdateComfyWorkflowDto,
} from './dto/comfyui.dto';

@ApiTags('ComfyWorkflow')
@ApiBearerAuth()
@Controller('comfyui/workflows')
export class ComfyWorkflowsController {
  constructor(private readonly service: ComfyWorkflowsService) {}

  @Get()
  @RequirePermissions('ComfyWorkflow.read')
  findAll(@Query() query: QueryComfyWorkflowDto) {
    return this.service.findAll(query);
  }

  @Get('options')
  @RequirePermissions('ComfyTask.read')
  options() {
    return this.service.options();
  }

  @Get(':id')
  @RequirePermissions('ComfyWorkflow.read')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('ComfyWorkflow.create')
  create(@Body() dto: CreateComfyWorkflowDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('ComfyWorkflow.update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateComfyWorkflowDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete('batch')
  @RequirePermissions('ComfyWorkflow.batchDelete')
  batchRemove(@Body() dto: BatchIdsDto) {
    return this.service.batchRemove(dto.ids);
  }

  @Delete(':id')
  @RequirePermissions('ComfyWorkflow.delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
