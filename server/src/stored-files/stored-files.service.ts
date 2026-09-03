import { BadRequestException, Injectable } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { basename, join, normalize, resolve } from 'node:path';
import { TextDecoder } from 'node:util';
import { StorageConfigService } from '../storage-config/storage-config.service';

export interface StoredFileContent {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  source: 'local' | 'remote';
}

@Injectable()
export class StoredFilesService {
  private readonly uploadRoot = resolve(process.cwd(), 'uploads');
  private readonly maxRemoteFileSize = 50 * 1024 * 1024;
  private readonly remoteTimeoutMs = 30_000;

  constructor(private readonly storageConfigService: StorageConfigService) {}

  async read(
    fileUrl: string,
    fileName?: string | null,
  ): Promise<StoredFileContent> {
    const url = fileUrl?.trim();
    if (!url) {
      throw new BadRequestException('文件 URL 不能为空');
    }

    const localPath = await this.resolveLocalUploadPath(url);
    if (localPath) {
      const buffer = await fs.readFile(localPath);
      const resolvedFileName = fileName?.trim() || basename(localPath);
      return {
        buffer,
        fileName: resolvedFileName,
        mimeType: this.resolveMimeType(resolvedFileName),
        source: 'local',
      };
    }

    const readableUrl = await this.storageConfigService.resolveReadableUrl(url);
    return this.readRemoteFile(
      readableUrl,
      fileName || this.resolveFileName(url),
    );
  }

  /**
   * 解码文本文件内容，兼容中文 TXT 常见的 UTF-8、UTF-16 和 GB18030 编码。
  * 无 BOM 时优先严格尝试 UTF-8，失败后再回退 GB18030，避免中文正文提前变成乱码。
  */
  decodeText(buffer: Buffer) {
    if (
      buffer.length >= 3 &&
      buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))
    ) {
      return new TextDecoder('utf-8').decode(buffer.subarray(3));
    }
    if (
      buffer.length >= 2 &&
      buffer.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))
    ) {
      return new TextDecoder('utf-16le').decode(buffer.subarray(2));
    }
    if (
      buffer.length >= 2 &&
      buffer.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))
    ) {
      return new TextDecoder('utf-16be').decode(buffer.subarray(2));
    }

    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      return new TextDecoder('gb18030').decode(buffer);
    }
  }

  private async resolveLocalUploadPath(fileUrl: string) {
    const pathname = await this.resolveLocalUploadPathname(fileUrl);
    if (!pathname) return '';

    const relativePath = decodeURIComponent(pathname).replace(
      /^\/uploads\/?/,
      '',
    );
    const normalizedPath = normalize(relativePath);
    const targetPath = resolve(join(this.uploadRoot, normalizedPath));
    if (!targetPath.startsWith(this.uploadRoot)) {
      throw new BadRequestException('非法的本地文件路径');
    }
    return targetPath;
  }

  private async resolveLocalUploadPathname(fileUrl: string) {
    if (fileUrl.startsWith('/uploads/')) {
      return fileUrl;
    }

    let url: URL;
    try {
      url = new URL(fileUrl);
    } catch {
      return '';
    }
    if (!url.pathname.startsWith('/uploads/')) {
      return '';
    }

    const storageConfig = await this.storageConfigService.getConfig();
    if (storageConfig.provider === 'local') {
      if (!storageConfig.publicBaseUrl) {
        return this.isLocalHost(url.hostname) ? url.pathname : '';
      }
      return this.isSameOrigin(fileUrl, storageConfig.publicBaseUrl)
        ? url.pathname
        : '';
    }

    return '';
  }

  private async readRemoteFile(
    fileUrl: string,
    fileName?: string | null,
  ): Promise<StoredFileContent> {
    let response: Response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.remoteTimeoutMs);
    try {
      response = await fetch(fileUrl, { signal: controller.signal });
    } catch {
      throw new BadRequestException('远程文件读取失败');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new BadRequestException(`远程文件读取失败：${response.status}`);
    }
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > this.maxRemoteFileSize) {
      throw new BadRequestException('远程文件超过最大解析大小');
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > this.maxRemoteFileSize) {
      throw new BadRequestException('远程文件超过最大解析大小');
    }
    const resolvedFileName = fileName?.trim() || this.resolveFileName(fileUrl);
    return {
      buffer,
      fileName: resolvedFileName,
      mimeType:
        response.headers.get('content-type') ||
        this.resolveMimeType(resolvedFileName),
      source: 'remote',
    };
  }

  private isSameOrigin(left: string, right: string) {
    try {
      const leftUrl = new URL(left);
      const rightUrl = new URL(right);
      return leftUrl.origin === rightUrl.origin;
    } catch {
      return false;
    }
  }

  private isLocalHost(hostname: string) {
    return ['localhost', '127.0.0.1', '::1'].includes(hostname);
  }

  private resolveFileName(fileUrl: string) {
    try {
      return basename(new URL(fileUrl).pathname) || '附件文件';
    } catch {
      return basename(fileUrl) || '附件文件';
    }
  }

  private resolveMimeType(fileName: string) {
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith('.pdf')) return 'application/pdf';
    if (lowerName.endsWith('.doc')) return 'application/msword';
    if (lowerName.endsWith('.docx')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (lowerName.endsWith('.txt')) return 'text/plain';
    if (lowerName.endsWith('.md')) return 'text/markdown';
    if (lowerName.endsWith('.png')) return 'image/png';
    if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
      return 'image/jpeg';
    }
    if (lowerName.endsWith('.webp')) return 'image/webp';
    if (lowerName.endsWith('.bmp')) return 'image/bmp';
    return 'application/octet-stream';
  }
}
