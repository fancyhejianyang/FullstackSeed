import { Injectable } from '@nestjs/common';
import OSS from 'ali-oss';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import type {
  StorageProvider,
  UpdateStorageConfigDto,
} from './dto/storage-config.dto';

export interface StorageConfig {
  enabled: boolean;
  provider: StorageProvider;
  publicBaseUrl: string;
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  accessKeySecret: string;
  uploadDir: string;
  updatedAt: string;
}

@Injectable()
export class StorageConfigService {
  private readonly configPath = join(
    process.cwd(),
    'storage',
    'storage-config.json',
  );

  constructor(private readonly configService: ConfigService) {}

  async getConfig(): Promise<StorageConfig> {
    const config = this.getDefaultConfig();
    try {
      const content = await fs.readFile(this.configPath, 'utf8');
      const saved = JSON.parse(content) as Partial<StorageConfig>;
      return this.normalizeConfig({ ...config, ...saved });
    } catch {
      return config;
    }
  }

  async updateConfig(dto: UpdateStorageConfigDto): Promise<StorageConfig> {
    const current = await this.getConfig();
    const next = this.normalizeConfig({
      ...current,
      ...dto,
      updatedAt: new Date().toISOString(),
    });
    await fs.mkdir(join(process.cwd(), 'storage'), { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(next, null, 2), 'utf8');
    return next;
  }

  async resolveReadableUrl(fileUrl: string, expiresSeconds = 3600) {
    const config = await this.getConfig();
    if (config.enabled && config.provider === 'aliyun-oss') {
      const objectKey = this.resolveAliyunObjectKey(fileUrl, config);
      if (objectKey) {
        this.assertAliyunOssConfig(config);
        const client = new OSS({
          region: config.region,
          endpoint: config.endpoint,
          accessKeyId: config.accessKeyId,
          accessKeySecret: config.accessKeySecret,
          bucket: config.bucket,
          secure: true,
        });
        return client.signatureUrl(objectKey, {
          expires: expiresSeconds,
          method: 'GET',
        });
      }
    }
    return fileUrl;
  }

  async isConfiguredPublicUrl(fileUrl: string) {
    const config = await this.getConfig();
    return !!this.resolveAliyunObjectKey(fileUrl, config);
  }

  private getDefaultConfig(): StorageConfig {
    return {
      enabled: false,
      provider: 'local',
      publicBaseUrl: this.configService.get<string>(
        'UPLOAD_PUBLIC_BASE_URL',
        '',
      ),
      bucket: '',
      region: '',
      endpoint: '',
      accessKeyId: '',
      accessKeySecret: '',
      uploadDir: 'uploads',
      updatedAt: '',
    };
  }

  private normalizeConfig(config: StorageConfig): StorageConfig {
    return {
      enabled: !!config.enabled,
      provider: config.provider || 'local',
      publicBaseUrl: this.trimUrl(config.publicBaseUrl),
      bucket: config.bucket?.trim() ?? '',
      region: config.region?.trim() ?? '',
      endpoint: this.trimUrl(config.endpoint),
      accessKeyId: config.accessKeyId?.trim() ?? '',
      accessKeySecret: config.accessKeySecret?.trim() ?? '',
      uploadDir: config.uploadDir?.trim() || 'uploads',
      updatedAt: config.updatedAt || '',
    };
  }

  private resolveAliyunObjectKey(fileUrl: string, config: StorageConfig) {
    if (!config.publicBaseUrl) return '';
    let url: URL;
    try {
      url = new URL(fileUrl);
    } catch {
      return '';
    }
    const publicBaseUrl = this.withProtocol(config.publicBaseUrl);
    let publicUrl: URL;
    try {
      publicUrl = new URL(publicBaseUrl);
    } catch {
      return '';
    }
    if (url.hostname !== publicUrl.hostname) return '';
    return decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  }

  private assertAliyunOssConfig(config: StorageConfig) {
    const missingFields = [
      ['Bucket', config.bucket],
      ['Region', config.region],
      ['Endpoint', config.endpoint],
      ['AccessKey', config.accessKeyId],
      ['Secret', config.accessKeySecret],
    ]
      .filter(([, value]) => !value)
      .map(([label]) => label);
    if (missingFields.length) {
      throw new Error(`阿里云 OSS 配置不完整：${missingFields.join('、')}`);
    }
  }

  private withProtocol(value: string) {
    const text = value.trim();
    if (/^https?:\/\//i.test(text)) return text;
    return `https://${text}`;
  }

  private trimUrl(value: string | undefined) {
    return (value ?? '').trim().replace(/\/+$/, '');
  }
}
