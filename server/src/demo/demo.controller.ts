import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DemoService } from './demo.service';
import {
  CreateDemoDto,
  UpdateDemoDto,
  QueryDemoDto,
  BatchDeleteDemoDto,
} from './dto/demo.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';

@ApiTags('Demo')
@ApiBearerAuth()
@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  @Get()
  @RequirePermissions('Demo.read')
  @ApiOperation({ summary: '分页查询示例' })
  findAll(@Query() query: QueryDemoDto) {
    return this.demoService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('Demo.read')
  @ApiOperation({ summary: '示例详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.demoService.findOne(id);
  }

  @Post()
  @RequirePermissions('Demo.create')
  @ApiOperation({ summary: '创建示例' })
  create(@Body() dto: CreateDemoDto) {
    return this.demoService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('Demo.update')
  @ApiOperation({ summary: '更新示例' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDemoDto,
  ) {
    return this.demoService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('Demo.delete')
  @ApiOperation({ summary: '删除示例' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.demoService.remove(id);
  }

  @Post('batch-delete')
  @RequirePermissions('Demo.batchDelete')
  @ApiOperation({ summary: '批量删除示例' })
  batchRemove(@Body() dto: BatchDeleteDemoDto) {
    return this.demoService.batchRemove(dto.ids);
  }
}
