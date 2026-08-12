import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { extname, join } from 'node:path';
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

  async saveFile(file: UploadedStorageFile): Promise<UploadResult> {
    if (!file.buffer?.length) {
      throw new BadRequestException('文件内容为空');
    }

    const storageConfig = await this.storageConfigService.getConfig();
    if (storageConfig.enabled && storageConfig.provider !== 'local') {
      return this.saveFileToOss(file, storageConfig);
    }

    return this.saveFileAsLocal(file, storageConfig);
  }

  private async saveFileToOss(
    file: UploadedStorageFile,
    storageConfig: StorageConfig,
  ): Promise<UploadResult> {
    /**
     * OSS/CDN 伪代码连接点：
     * 1. 根据 storageConfig.provider 创建对应 SDK Client
     * 2. 使用 bucket / region / endpoint / accessKeyId / accessKeySecret 初始化
     * 3. const objectKey = `${storageConfig.uploadDir}/${dateDir}/${fileName}`
     * 4. await client.putObject(objectKey, file.buffer, { contentType: file.mimetype })
     * 5. return { url: `${storageConfig.publicBaseUrl}/${objectKey}`, ... }
     *
     * 当前种子项目未绑定具体云厂商 SDK，因此先回退本地存储，保证接口契约可用。
     */
    return this.saveFileAsLocal(file, storageConfig);
  }

  private async saveFileAsLocal(
    file: UploadedStorageFile,
    storageConfig: StorageConfig,
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
      url: this.buildPublicUrl(`/uploads/${dateDir}/${fileName}`, storageConfig),
      fileName,
      originalName: this.normalizeFileName(file.originalname),
      mimeType: file.mimetype ?? 'application/octet-stream',
      size: file.size,
    };
  }

  private buildPublicUrl(pathname: string, storageConfig: StorageConfig) {
    return storageConfig.publicBaseUrl
      ? `${storageConfig.publicBaseUrl}${pathname}`
      : pathname;
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
