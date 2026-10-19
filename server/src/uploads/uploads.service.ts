import { BadRequestException, Injectable } from '@nestjs/common';
import OSS from 'ali-oss';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, extname, join, posix, resolve, sep } from 'node:path';
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

export interface ManagedUploadContext {
  scope: 'ai-materials' | 'comfyui';
  ownerId: number;
  businessId: number;
  revision: number;
}

export interface ManagedUploadTarget extends UploadResult {
  provider: 'local' | 'aliyun-oss';
  objectKey: string;
  storageIdentity: string;
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

  async reserveManagedFile(
    file: UploadedStorageFile,
    context: ManagedUploadContext,
  ): Promise<ManagedUploadTarget> {
    if (!file.buffer?.length) throw new BadRequestException('文件内容为空');
    if (
      !Number.isSafeInteger(context.ownerId) ||
      context.ownerId < 1 ||
      !Number.isSafeInteger(context.businessId) ||
      context.businessId < 1 ||
      !Number.isSafeInteger(context.revision) ||
      context.revision < 1
    )
      throw new BadRequestException('受管文件上下文无效');
    const config = await this.storageConfigService.getConfig();
    const fileName = `${randomUUID()}${this.getSafeExt(file.originalname)}`;
    const environment = this.environmentName();
    const relativeKey = posix.join(
      context.scope,
      environment,
      'objects',
      String(context.ownerId),
      String(context.businessId),
      String(context.revision),
      fileName,
    );
    const provider =
      config.enabled && config.provider !== 'local' ? config.provider : 'local';
    if (provider !== 'local' && provider !== 'aliyun-oss')
      throw new BadRequestException('当前存储类型暂未接入受管文件');
    if (provider === 'aliyun-oss') this.assertAliyunOssConfig(config);
    const objectKey =
      provider === 'aliyun-oss'
        ? posix.join(
            config.uploadDir.replace(/^\/+|\/+$/g, '') || 'uploads',
            relativeKey,
          )
        : relativeKey;
    const url =
      provider === 'aliyun-oss'
        ? this.buildOssPublicUrl(config.publicBaseUrl, objectKey)
        : this.buildPublicUrl(`/uploads/${objectKey}`, config, '');
    return {
      url,
      fileName,
      originalName: this.normalizeFileName(file.originalname),
      mimeType: file.mimetype ?? 'application/octet-stream',
      size: file.size,
      provider,
      objectKey,
      storageIdentity: this.storageIdentity(config, provider),
    };
  }

  async writeManagedFile(
    file: UploadedStorageFile,
    target: ManagedUploadTarget,
  ) {
    const config = await this.storageConfigService.getConfig();
    if (
      target.storageIdentity !== this.storageIdentity(config, target.provider)
    )
      throw new BadRequestException('存储配置已变化，请重新提交生成任务');
    if (target.provider === 'aliyun-oss') {
      this.assertAliyunOssConfig(config);
      this.assertManagedObjectKey(target.objectKey, config, 'aliyun-oss');
      const client = this.ossClient(config);
      await client.put(target.objectKey, file.buffer, {
        mime: file.mimetype || 'application/octet-stream',
        headers: {
          'Content-Type': file.mimetype || 'application/octet-stream',
        },
      });
      return;
    }
    const targetPath = this.localManagedPath(target.objectKey);
    await fs.mkdir(dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, file.buffer);
  }

  async deleteManagedFile(target: {
    provider: string;
    objectKey: string;
    storageIdentity: string;
  }) {
    const config = await this.storageConfigService.getConfig();
    if (target.provider !== 'local' && target.provider !== 'aliyun-oss')
      throw new BadRequestException('不支持清理该存储类型');
    if (
      target.storageIdentity !==
      this.storageIdentity(config, target.provider as 'local' | 'aliyun-oss')
    )
      throw new BadRequestException('文件所属存储位置与当前配置不一致');
    if (target.provider === 'aliyun-oss') {
      this.assertAliyunOssConfig(config);
      this.assertManagedObjectKey(target.objectKey, config, 'aliyun-oss');
      await this.ossClient(config).delete(target.objectKey);
      return;
    }
    try {
      await fs.unlink(this.localManagedPath(target.objectKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
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
    const client = this.ossClient(storageConfig);

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

  private ossClient(storageConfig: StorageConfig) {
    return new OSS({
      region: storageConfig.region,
      endpoint: storageConfig.endpoint,
      accessKeyId: storageConfig.accessKeyId,
      accessKeySecret: storageConfig.accessKeySecret,
      bucket: storageConfig.bucket,
      secure: true,
    });
  }

  private storageIdentity(
    config: StorageConfig,
    provider: 'local' | 'aliyun-oss',
  ) {
    const value =
      provider === 'aliyun-oss'
        ? [provider, config.bucket, config.region, config.endpoint].join('|')
        : [provider, resolve(this.uploadRoot)].join('|');
    return createHash('sha256').update(value).digest('hex');
  }

  private localManagedPath(objectKey: string) {
    this.assertManagedObjectKey(objectKey, null, 'local');
    const normalized = objectKey.replace(/\\/g, '/');
    const root = resolve(this.uploadRoot);
    const target = resolve(root, ...normalized.split('/'));
    if (!target.startsWith(root + sep))
      throw new BadRequestException('受管文件路径超出允许范围');
    return target;
  }

  private assertManagedObjectKey(
    objectKey: string,
    config: StorageConfig | null,
    provider: 'local' | 'aliyun-oss',
  ) {
    const normalized = objectKey.replace(/\\/g, '/');
    if (
      normalized.startsWith('/') ||
      normalized.includes('../') ||
      normalized !== posix.normalize(normalized) ||
      !/^[A-Za-z0-9/_\-.]+$/.test(normalized)
    )
      throw new BadRequestException('受管文件路径无效');
    const root =
      provider === 'local'
        ? ''
        : `${config?.uploadDir.replace(/^\/+|\/+$/g, '') || 'uploads'}/`;
    if (
      !normalized.startsWith(`${root}ai-materials/`) &&
      !normalized.startsWith(`${root}comfyui/`)
    )
      throw new BadRequestException('文件不属于允许的受管存储范围');
  }

  private environmentName() {
    const value = (process.env.NODE_ENV || 'development').toLowerCase();
    return /^[a-z0-9_-]+$/.test(value) ? value : 'development';
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
