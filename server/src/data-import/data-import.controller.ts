import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import {
  CreateDataImportConfigDto,
  QueryDataImportConfigDto,
} from './dto/data-import.dto';
import {
  DataImportService,
  type UploadedTemplateFile,
} from './data-import.service';

@ApiTags('DataImport')
@ApiBearerAuth()
@Controller('data-import')
export class DataImportController {
  constructor(private readonly dataImportService: DataImportService) {}

  @Get('configs')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '分页查询数据导入配置记录' })
  findAll(@Query() query: QueryDataImportConfigDto) {
    return this.dataImportService.findAll(query);
  }

  @Post('configs')
  @RequirePermissions('Menu.read')
  @UseInterceptors(FileInterceptor('template'))
  @ApiOperation({ summary: '保存数据导入字段配置并上传模板' })
  createConfig(
    @Body() dto: CreateDataImportConfigDto,
    @UploadedFile() template?: UploadedTemplateFile,
  ) {
    return this.dataImportService.createConfig(dto, template);
  }

  @Get('configs/:id/template')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '下载数据导入模板文件' })
  async downloadTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const template = await this.dataImportService.getTemplateFile(id);
    res.setHeader('Content-Type', template.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(template.filename)}`,
    );
    res.send(template.content);
  }
}
