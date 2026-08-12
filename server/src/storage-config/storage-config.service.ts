import { Injectable } from '@nestjs/common';
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

  private getDefaultConfig(): StorageConfig {
    return {
      enabled: false,
      provider: 'local',
      publicBaseUrl: this.configService.get<string>('UPLOAD_PUBLIC_BASE_URL', ''),
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

  private trimUrl(value: string | undefined) {
    return (value ?? '').trim().replace(/\/+$/, '');
  }
}
