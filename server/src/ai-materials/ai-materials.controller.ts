import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import type { UploadedStorageFile } from '../uploads/uploads.service';
import { AiMaterialsService } from './ai-materials.service';
import {
  BatchDeleteAiMaterialDto,
  CreateAiMaterialDto,
  GenerateAiMaterialDto,
  QueryAiMaterialDto,
  UpdateAiMaterialDto,
} from './dto/ai-material.dto';

@ApiTags('AiMaterial')
@ApiBearerAuth()
@Controller('ai-materials')
export class AiMaterialsController {
  constructor(private readonly service: AiMaterialsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('AiMaterial.read')
  findAll(
    @Query() query: QueryAiMaterialDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.findAll(query, userId);
  }

  @Get('config-options')
  @RequirePermissions('AiMaterial.read')
  @ApiOperation({ summary: '启用的图片生成配置选项' })
  configOptions(@Query() query: QueryAiMaterialDto) {
    return this.service.configOptions(query);
  }

  @Post('batch-delete')
  @RequirePermissions('AiMaterial.batchDelete')
  batchRemove(
    @Body() dto: BatchDeleteAiMaterialDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.batchRemove(dto, userId);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('AiMaterial.read')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.findOne(id, userId);
  }

  @Post()
  @RequirePermissions('AiMaterial.create')
  @UseInterceptors(
    FileInterceptor('referenceImage', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  create(
    @Body() dto: CreateAiMaterialDto,
    @CurrentUser('userId') userId: number,
    @UploadedFile() referenceImage?: UploadedStorageFile,
  ) {
    return this.service.create(dto, userId, referenceImage);
  }

  @Patch(':id')
  @RequirePermissions('AiMaterial.update')
  @UseInterceptors(
    FileInterceptor('referenceImage', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAiMaterialDto,
    @CurrentUser('userId') userId: number,
    @UploadedFile() referenceImage?: UploadedStorageFile,
  ) {
    return this.service.update(id, dto, userId, referenceImage);
  }

  @Delete(':id')
  @RequirePermissions('AiMaterial.delete')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.remove(id, userId);
  }

  @Post(':id/generate')
  @RequirePermissions('AiMaterial.update')
  generate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GenerateAiMaterialDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.submit(id, dto, userId);
  }
}
