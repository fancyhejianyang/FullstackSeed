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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { ComfyTasksService } from './comfy-tasks.service';
import {
  BatchIdsDto,
  CreateComfyTaskDto,
  QueryComfyTaskDto,
} from './dto/comfyui.dto';

@ApiTags('ComfyTask')
@ApiBearerAuth()
@Controller('comfyui/tasks')
export class ComfyTasksController {
  constructor(private readonly service: ComfyTasksService) {}

  @Get()
  @RequirePermissions('ComfyTask.read')
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryComfyTaskDto) {
    return this.service.findAll(user.userId, query);
  }

  @Get(':id')
  @RequirePermissions('ComfyTask.read')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findOne(id, user.userId);
  }

  @Post()
  @RequirePermissions('ComfyTask.create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateComfyTaskDto) {
    return this.service.create(user.userId, dto);
  }

  @Post(':id/retry')
  @RequirePermissions('ComfyTask.create')
  retry(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.retry(id, user.userId);
  }

  @Post(':id/cancel')
  @RequirePermissions('ComfyTask.update')
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.cancel(id, user.userId);
  }

  @Delete('batch')
  @RequirePermissions('ComfyTask.batchDelete')
  batchRemove(@Body() dto: BatchIdsDto, @CurrentUser() user: AuthUser) {
    return this.service.batchRemove(dto.ids, user.userId);
  }

  @Delete(':id')
  @RequirePermissions('ComfyTask.delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user.userId);
  }
}
