import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { type UploadedStorageFile } from './uploads.service';
import { OrdinaryUploadsService } from './ordinary-uploads.service';
import { DownloadUploadDto, UploadUrlDto } from './dto/upload.dto';
import { PUBLIC_UPLOAD_LIMIT, uploadMimeType } from './upload-policy';

interface UploadRequest {
  protocol?: string;
  headers?: Record<string, string | string[] | undefined>;
  get?: (name: string) => string | undefined;
}

@ApiTags('Uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: OrdinaryUploadsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: PUBLIC_UPLOAD_LIMIT, files: 1, fields: 0 },
      fileFilter: (_request, file, callback) => {
        try {
          uploadMimeType(file.originalname);
          callback(null, true);
        } catch (error) {
          callback(error as Error, false);
        }
      },
    }),
  )
  @ApiOperation({ summary: '上传文件并返回可访问 URL' })
  upload(
    @UploadedFile() file?: UploadedStorageFile,
    @CurrentUser() user?: AuthUser,
    @Req() request?: UploadRequest,
  ) {
    if (!file) {
      throw new BadRequestException('请上传文件');
    }
    return this.uploadsService.upload(
      file,
      user!.userId,
      this.resolvePublicOrigin(request),
    );
  }

  @Post('release')
  @ApiOperation({ summary: '标记附件待清理，保留业务引用与回收宽限期' })
  release(@Body() dto: UploadUrlDto, @CurrentUser() user: AuthUser) {
    return this.uploadsService.release(dto.url, user);
  }

  @Post('download')
  @ApiOperation({ summary: '下载普通上传附件' })
  async download(
    @Body() dto: DownloadUploadDto,
    @Req() request: UploadRequest,
    @Res() response: Response,
  ) {
    const result = await this.uploadsService.download(
      dto.url,
      dto.name,
      this.resolvePublicOrigin(request),
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.attachment(result.name);
    response.type('application/octet-stream').send(result.buffer);
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
