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
  BatchDeleteExternalAppDto,
  CreateExternalAppDto,
  QueryExternalAppDto,
  UpdateExternalAppDto,
} from './dto/external-app.dto';
import { ExternalAppsService } from './external-apps.service';

@ApiTags('ExternalApp')
@ApiBearerAuth()
@Controller('external-apps')
export class ExternalAppsController {
  constructor(private readonly externalAppsService: ExternalAppsService) {}

  @Get()
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '分页查询外部应用' })
  findAll(@Query() query: QueryExternalAppDto) {
    return this.externalAppsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '外部应用详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.externalAppsService.findOne(id);
  }

  @Post()
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '创建外部应用并分配 appId' })
  create(@Body() dto: CreateExternalAppDto) {
    return this.externalAppsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '更新外部应用' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExternalAppDto,
  ) {
    return this.externalAppsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '删除外部应用' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.externalAppsService.remove(id);
  }

  @Post('batch-delete')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '批量删除外部应用' })
  batchRemove(@Body() dto: BatchDeleteExternalAppDto) {
    return this.externalAppsService.batchRemove(dto.ids);
  }
}
