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
import { ModelEndpointsService } from './model-endpoints.service';
import {
  BatchDeleteModelEndpointDto,
  CreateModelEndpointDto,
  QueryModelEndpointDto,
  UpdateModelEndpointDto,
} from './dto/model-endpoint.dto';

@ApiTags('模型厂商调用接口')
@ApiBearerAuth()
@Controller('model-endpoints')
export class ModelEndpointsController {
  constructor(private readonly service: ModelEndpointsService) {}

  @Get('options')
  @RequirePermissions('ModelEndpoint.read')
  @ApiOperation({ summary: '接口平台、功能与协议选项' })
  options() {
    return this.service.options();
  }

  @Post('import-official')
  @RequirePermissions('ModelEndpoint.create')
  @ApiOperation({ summary: '补充已核对的官方预设，保留已编辑、停用和删除记录' })
  importOfficial() {
    return this.service.importPresets();
  }

  @Get()
  @RequirePermissions('ModelEndpoint.read')
  @ApiOperation({ summary: '分页查询模型调用接口' })
  findAll(@Query() query: QueryModelEndpointDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('ModelEndpoint.read')
  @ApiOperation({ summary: '模型调用接口详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('ModelEndpoint.create')
  @ApiOperation({ summary: '创建模型调用接口' })
  create(@Body() dto: CreateModelEndpointDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('ModelEndpoint.update')
  @ApiOperation({ summary: '更新模型调用接口' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateModelEndpointDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('ModelEndpoint.delete')
  @ApiOperation({ summary: '软删除模型调用接口' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post('batch-delete')
  @RequirePermissions('ModelEndpoint.batchDelete')
  @ApiOperation({ summary: '批量软删除模型调用接口' })
  batchRemove(@Body() dto: BatchDeleteModelEndpointDto) {
    return this.service.batchRemove(dto.ids);
  }
}
