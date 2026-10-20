/* eslint-disable @typescript-eslint/unbound-method -- Tests inspect decorator metadata; handlers are not invoked unbound. */
import { DataSource } from 'typeorm';
import { ThirdPartyConfigService } from './third-party-config.service';
import {
  StorageConfigService,
  mergeStorageCredentials,
  publicStorageConfig,
  type StorageConfig,
} from '../storage-config/storage-config.service';
import { KnowledgeAiProvider } from '../knowledge-ai-providers/entities/knowledge-ai-provider.entity';
import { PERMISSIONS_KEY } from '../common/decorators/require-permissions.decorator';
import { KnowledgeAiProvidersController } from '../knowledge-ai-providers/knowledge-ai-providers.controller';
import { StorageConfigController } from '../storage-config/storage-config.controller';
import { DashboardController } from '../dashboard/dashboard.controller';
const user = (permissions: string[]) => ({
  userId: 1,
  username: 'test',
  isAdmin: false,
  roles: [],
  permissions,
});
const secretConfig: StorageConfig = {
  enabled: true,
  provider: 'aliyun-oss',
  publicBaseUrl: '',
  bucket: 'bucket',
  region: 'region',
  endpoint: 'https://example.test',
  accessKeyId: 'private-id',
  accessKeySecret: 'private-secret',
  uploadDir: 'uploads',
  updatedAt: '2026-10-19T00:00:00Z',
};
describe('third-party access and credentials', () => {
  it('does not query services the current user cannot view', async () => {
    const db = { getRepository: jest.fn() };
    const storage = { getConfig: jest.fn() };
    const service = new ThirdPartyConfigService(
      db as unknown as DataSource,
      storage as unknown as StorageConfigService,
    );
    expect(await service.overview(user(['Menu.read']))).toEqual([]);
    expect(db.getRepository).not.toHaveBeenCalled();
    expect(storage.getConfig).not.toHaveBeenCalled();
    await expect(service.options(user([]))).rejects.toThrow('无权限');
  });
  it('returns only safe aggregate status, no secrets or endpoint', async () => {
    const storage = { getConfig: jest.fn().mockResolvedValue(secretConfig) };
    const service = new ThirdPartyConfigService(
      {} as DataSource,
      storage as unknown as StorageConfigService,
    );
    const result = await service.overview(
      user(['StorageConfig.read', 'WechatConfig.read']),
    );
    expect(result.map((i) => i.status)).toEqual(['unsupported', 'configured']);
    expect(JSON.stringify(result)).not.toContain('private');
    expect(JSON.stringify(result)).not.toContain('endpoint');
  });
  it('projects safe model options without granting the configuration read permission', async () => {
    const repo = { find: jest.fn().mockResolvedValue([]) };
    const db = { getRepository: jest.fn(() => repo) };
    const service = new ThirdPartyConfigService(
      db as unknown as DataSource,
      {} as StorageConfigService,
    );
    await service.options(user(['VectorConfig.read']));
    expect(db.getRepository).toHaveBeenCalledTimes(1);
    expect(db.getRepository).toHaveBeenCalledWith(KnowledgeAiProvider);
    expect(repo.find).toHaveBeenCalledWith({
      select: [
        'id',
        'name',
        'isEnabled',
        'models',
        'textModels',
        'visionModels',
        'imageGenerationModels',
        'videoGenerationModels',
        'embeddingModels',
      ],
      order: { id: 'DESC' },
    });
  });
  it('never echoes credentials, retains blank values and clears only explicitly', () => {
    const safe = publicStorageConfig(secretConfig);
    expect(safe.accessKeyIdSet).toBe(true);
    expect(safe.accessKeySecretSet).toBe(true);
    expect(safe.accessKeyId).toBe('');
    expect(safe.accessKeySecret).toBe('');
    const dto = {
      enabled: true,
      provider: 'aliyun-oss' as const,
      accessKeyId: ' ',
      accessKeySecret: '',
    };
    expect(mergeStorageCredentials(secretConfig, dto)).toEqual({
      accessKeyId: 'private-id',
      accessKeySecret: 'private-secret',
    });
    expect(
      mergeStorageCredentials(secretConfig, { ...dto, clearCredentials: true }),
    ).toEqual({ accessKeyId: '', accessKeySecret: '' });
    expect(
      mergeStorageCredentials(secretConfig, {
        ...dto,
        accessKeySecret: ' new-secret ',
      }),
    ).toEqual({ accessKeyId: 'private-id', accessKeySecret: 'new-secret' });
  });
  it('separates read/update permissions on controllers and protects publication', () => {
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        KnowledgeAiProvidersController.prototype.findAll,
      ),
    ).toEqual(['KnowledgeAiProvider.read']);
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        KnowledgeAiProvidersController.prototype.update,
      ),
    ).toEqual(['KnowledgeAiProvider.update']);
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        StorageConfigController.prototype.updateConfig,
      ),
    ).toEqual(['StorageConfig.update']);
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        DashboardController.prototype.publish,
      ),
    ).toEqual(['DashboardConfig.read', 'DashboardConfig.update']);
  });
});
