import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { extname, join } from 'node:path';

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

  constructor(private readonly configService: ConfigService) {}

  async saveFile(file: UploadedStorageFile): Promise<UploadResult> {
    if (!file.buffer?.length) {
      throw new BadRequestException('文件内容为空');
    }

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
      url: this.buildPublicUrl(`/uploads/${dateDir}/${fileName}`),
      fileName,
      originalName: this.normalizeFileName(file.originalname),
      mimeType: file.mimetype ?? 'application/octet-stream',
      size: file.size,
    };
  }

  private buildPublicUrl(pathname: string) {
    const publicBaseUrl = this.configService
      .get<string>('UPLOAD_PUBLIC_BASE_URL', '')
      .trim()
      .replace(/\/+$/, '');
    return publicBaseUrl ? `${publicBaseUrl}${pathname}` : pathname;
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
