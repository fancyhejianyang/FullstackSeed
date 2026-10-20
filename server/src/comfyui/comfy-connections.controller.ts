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
import { ComfyConnectionsService } from './comfy-connections.service';
import {
  BatchIdsDto,
  CreateComfyConnectionDto,
  QueryComfyConnectionDto,
  UpdateComfyConnectionDto,
} from './dto/comfyui.dto';

@ApiTags('ComfyConnection')
@ApiBearerAuth()
@Controller('comfyui/connections')
export class ComfyConnectionsController {
  constructor(private readonly service: ComfyConnectionsService) {}

  @Get()
  @RequirePermissions('ComfyConnection.read')
  findAll(@Query() query: QueryComfyConnectionDto) {
    return this.service.findAll(query);
  }

  @Get('options')
  options() {
    return this.service.options();
  }

  @Get(':id')
  @RequirePermissions('ComfyConnection.read')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('ComfyConnection.create')
  create(@Body() dto: CreateComfyConnectionDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('ComfyConnection.update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateComfyConnectionDto,
  ) {
    return this.service.update(id, dto);
  }

  @Post(':id/test')
  @RequirePermissions('ComfyConnection.update')
  @ApiOperation({ summary: '检测 ComfyUI 服务可达性与基础能力' })
  test(@Param('id', ParseIntPipe) id: number) {
    return this.service.test(id);
  }

  @Delete('batch')
  @RequirePermissions('ComfyConnection.batchDelete')
  batchRemove(@Body() dto: BatchIdsDto) {
    return this.service.batchRemove(dto.ids);
  }

  @Delete(':id')
  @RequirePermissions('ComfyConnection.delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
