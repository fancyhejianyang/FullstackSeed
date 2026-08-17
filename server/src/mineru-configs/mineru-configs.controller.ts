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
  BatchDeleteMineruConfigDto,
  CreateMineruConfigDto,
  QueryMineruConfigDto,
  UpdateMineruConfigDto,
} from './dto/mineru-config.dto';
import { MineruConfigsService } from './mineru-configs.service';

@ApiTags('MineruConfig')
@ApiBearerAuth()
@Controller('mineru-configs')
export class MineruConfigsController {
  constructor(private readonly mineruConfigsService: MineruConfigsService) {}

  @Get()
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '分页查询 MinerU 配置' })
  findAll(@Query() query: QueryMineruConfigDto) {
    return this.mineruConfigsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: 'MinerU 配置详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.mineruConfigsService.findOne(id);
  }

  @Post()
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '创建 MinerU 配置' })
  create(@Body() dto: CreateMineruConfigDto) {
    return this.mineruConfigsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '更新 MinerU 配置' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMineruConfigDto) {
    return this.mineruConfigsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '删除 MinerU 配置' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.mineruConfigsService.remove(id);
  }

  @Post('batch-delete')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '批量删除 MinerU 配置' })
  batchRemove(@Body() dto: BatchDeleteMineruConfigDto) {
    return this.mineruConfigsService.batchRemove(dto.ids);
  }
}
