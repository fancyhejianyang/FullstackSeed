import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UploadsService, type UploadedStorageFile } from './uploads.service';

@ApiTags('Uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: '上传文件并返回可访问 URL' })
  upload(@UploadedFile() file?: UploadedStorageFile) {
    if (!file) {
      throw new BadRequestException('请上传文件');
    }
    return this.uploadsService.saveFile(file);
  }
}
