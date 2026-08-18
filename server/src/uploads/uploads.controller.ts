import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UploadsService, type UploadedStorageFile } from './uploads.service';

interface UploadRequest {
  protocol?: string;
  headers?: Record<string, string | string[] | undefined>;
  get?: (name: string) => string | undefined;
}

@ApiTags('Uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: '上传文件并返回可访问 URL' })
  upload(
    @UploadedFile() file?: UploadedStorageFile,
    @Req() request?: UploadRequest,
  ) {
    if (!file) {
      throw new BadRequestException('请上传文件');
    }
    return this.uploadsService.saveFile(file, this.resolvePublicOrigin(request));
  }

  private resolvePublicOrigin(request?: UploadRequest) {
    const forwardedProto = this.firstHeader(
      request?.headers?.['x-forwarded-proto'],
    );
    const forwardedHost = this.firstHeader(
      request?.headers?.['x-forwarded-host'],
    );
    const host =
      forwardedHost ||
      request?.get?.('host') ||
      this.firstHeader(request?.headers?.host);
    const protocol = forwardedProto || request?.protocol || 'http';

    return host ? `${protocol}://${host}` : '';
  }

  private firstHeader(value?: string | string[]) {
    return Array.isArray(value) ? value[0] : value;
  }
}
