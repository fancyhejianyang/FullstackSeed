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
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '分页查询向量化配置' })
  findAll(@Query() query: QueryVectorConfigDto) {
    return this.vectorConfigsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '向量化配置详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.vectorConfigsService.findOne(id);
  }

  @Post()
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '创建向量化配置' })
  create(@Body() dto: CreateVectorConfigDto) {
    return this.vectorConfigsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '更新向量化配置' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVectorConfigDto) {
    return this.vectorConfigsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '删除向量化配置' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.vectorConfigsService.remove(id);
  }

  @Post('batch-delete')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '批量删除向量化配置' })
  batchRemove(@Body() dto: BatchDeleteVectorConfigDto) {
    return this.vectorConfigsService.batchRemove(dto.ids);
  }
}
