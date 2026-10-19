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
  BatchDeleteVectorConfigDto,
  CreateVectorConfigDto,
  DetectVectorDimensionDto,
  QueryVectorConfigDto,
  UpdateVectorConfigDto,
} from './dto/vector-config.dto';
import { VectorConfigsService } from './vector-configs.service';

@ApiTags('VectorConfig')
@ApiBearerAuth()
@Controller('vector-configs')
export class VectorConfigsController {
  constructor(private readonly vectorConfigsService: VectorConfigsService) {}

  @Get()
  @RequirePermissions('VectorConfig.read')
  @ApiOperation({ summary: '分页查询向量化配置' })
  findAll(@Query() query: QueryVectorConfigDto) {
    return this.vectorConfigsService.findAll(query);
  }

  @Get('current')
  @RequirePermissions('VectorConfig.read')
  @ApiOperation({ summary: '当前向量化配置' })
  findCurrent() {
    return this.vectorConfigsService.findCurrent();
  }

  @Post('detect-dimension')
  @RequirePermissions('VectorConfig.update')
  @ApiOperation({ summary: '检测向量模型实际维度' })
  detectDimension(@Body() dto: DetectVectorDimensionDto) {
    return this.vectorConfigsService.detectDimension(dto);
  }

  @Post('current')
  @RequirePermissions('VectorConfig.update')
  @ApiOperation({ summary: '保存当前向量化配置' })
  saveCurrent(@Body() dto: CreateVectorConfigDto) {
    return this.vectorConfigsService.saveCurrent(dto);
  }

  @Get(':id')
  @RequirePermissions('VectorConfig.read')
  @ApiOperation({ summary: '向量化配置详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.vectorConfigsService.findOne(id);
  }

  @Post()
  @RequirePermissions('VectorConfig.create')
  @ApiOperation({ summary: '创建向量化配置' })
  create(@Body() dto: CreateVectorConfigDto) {
    return this.vectorConfigsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('VectorConfig.update')
  @ApiOperation({ summary: '更新向量化配置' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVectorConfigDto,
  ) {
    return this.vectorConfigsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('VectorConfig.delete')
  @ApiOperation({ summary: '删除向量化配置' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.vectorConfigsService.remove(id);
  }

  @Post('batch-delete')
  @RequirePermissions('VectorConfig.batchDelete')
  @ApiOperation({ summary: '批量删除向量化配置' })
  batchRemove(@Body() dto: BatchDeleteVectorConfigDto) {
    return this.vectorConfigsService.batchRemove(dto.ids);
  }
}
