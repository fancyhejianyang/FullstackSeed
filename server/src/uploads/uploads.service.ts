import { BadRequestException, Injectable } from '@nestjs/common';
import OSS from 'ali-oss';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { extname, join, posix } from 'node:path';
import {
  StorageConfigService,
  type StorageConfig,
} from '../storage-config/storage-config.service';

export interface UploadedStorageFile {
  originalname: string;
  mimetype?: string;
  size: number;
  buffer: Buffer;
}

export interface UploadResult {
  url: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class UploadsService {
  private readonly uploadRoot = join(process.cwd(), 'uploads');

  constructor(private readonly storageConfigService: StorageConfigService) {}

  async saveFile(
    file: UploadedStorageFile,
    requestOrigin = '',
  ): Promise<UploadResult> {
    if (!file.buffer?.length) {
      throw new BadRequestException('文件内容为空');
    }

    const storageConfig = await this.storageConfigService.getConfig();
    if (storageConfig.enabled && storageConfig.provider !== 'local') {
      return this.saveFileToOss(file, storageConfig, requestOrigin);
    }

    return this.saveFileAsLocal(file, storageConfig, requestOrigin);
  }

  private async saveFileToOss(
    file: UploadedStorageFile,
    storageConfig: StorageConfig,
    _requestOrigin: string,
  ): Promise<UploadResult> {
    if (storageConfig.provider !== 'aliyun-oss') {
      throw new BadRequestException('当前存储类型暂未接入上传实现');
    }
    this.assertAliyunOssConfig(storageConfig);

    const fileName = `${randomUUID()}${this.getSafeExt(file.originalname)}`;
    const objectKey = this.buildObjectKey(storageConfig.uploadDir, fileName);
    const client = new OSS({
      region: storageConfig.region,
      endpoint: storageConfig.endpoint,
      accessKeyId: storageConfig.accessKeyId,
      accessKeySecret: storageConfig.accessKeySecret,
      bucket: storageConfig.bucket,
      secure: true,
    });

    await client.put(objectKey, file.buffer, {
      mime: file.mimetype || 'application/octet-stream',
      headers: {
        'Content-Type': file.mimetype || 'application/octet-stream',
      },
    });

    return {
      url: this.buildOssPublicUrl(storageConfig.publicBaseUrl, objectKey),
      fileName,
      originalName: this.normalizeFileName(file.originalname),
      mimeType: file.mimetype ?? 'application/octet-stream',
      size: file.size,
    };
  }

  private async saveFileAsLocal(
    file: UploadedStorageFile,
    storageConfig: StorageConfig,
    requestOrigin: string,
  ): Promise<UploadResult> {
    const fileName = `${randomUUID()}${this.getSafeExt(file.originalname)}`;
    const now = new Date();
    const dateDir = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('/');
    const targetDir = join(this.uploadRoot, dateDir);
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(join(targetDir, fileName), file.buffer);

    return {
      url: this.buildPublicUrl(
        `/uploads/${dateDir}/${fileName}`,
        storageConfig,
        requestOrigin,
      ),
      fileName,
      originalName: this.normalizeFileName(file.originalname),
      mimeType: file.mimetype ?? 'application/octet-stream',
      size: file.size,
    };
  }

  private buildPublicUrl(
    pathname: string,
    storageConfig: StorageConfig,
    requestOrigin: string,
  ) {
    const publicBaseUrl = storageConfig.publicBaseUrl || requestOrigin;
    return publicBaseUrl
      ? `${publicBaseUrl.replace(/\/+$/, '')}${pathname}`
      : pathname;
  }

  private buildOssPublicUrl(publicBaseUrl: string, objectKey: string) {
    const baseUrl = this.withProtocol(publicBaseUrl);
    return `${baseUrl.replace(/\/+$/, '')}/${objectKey}`;
  }

  private buildObjectKey(uploadDir: string, fileName: string) {
    const now = new Date();
    const dateDir = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('/');
    return posix.join(
      uploadDir.replace(/^\/+|\/+$/g, '') || 'uploads',
      dateDir,
      fileName,
    );
  }

  private assertAliyunOssConfig(storageConfig: StorageConfig) {
    const missingFields = [
      ['公开域名', storageConfig.publicBaseUrl],
      ['Bucket', storageConfig.bucket],
      ['Region', storageConfig.region],
      ['Endpoint', storageConfig.endpoint],
      ['AccessKey', storageConfig.accessKeyId],
      ['Secret', storageConfig.accessKeySecret],
    ]
      .filter(([, value]) => !value)
      .map(([label]) => label);
    if (missingFields.length) {
      throw new BadRequestException(
        `阿里云 OSS 配置不完整：${missingFields.join('、')}`,
      );
    }
  }

  private withProtocol(value: string) {
    const text = value.trim();
    if (/^https?:\/\//i.test(text)) return text;
    return `https://${text}`;
  }

  private getSafeExt(filename: string) {
    const ext = extname(this.normalizeFileName(filename)).toLowerCase();
    return /^[.\w-]+$/.test(ext) ? ext : '';
  }

  private normalizeFileName(filename: string) {
    try {
      const decoded = Buffer.from(filename, 'latin1').toString('utf8');
      if (!decoded.includes('�') && /[\u4e00-\u9fa5]/.test(decoded)) {
        return decoded;
      }
    } catch {
      // 保留原文件名兜底即可。
    }
    return filename;
  }
}
