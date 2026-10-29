import type { StorageConfig } from '../storage-config/storage-config.service';
import { UploadsService } from './uploads.service';

describe('UploadsService managed storage policy', () => {
  it.each([
    'https://attacker.example/file.txt',
    '/uploads/../../storage/secrets.json',
    '/uploads/2026/10/29/%2e%2e/secret.txt',
    '/uploads/ai-materials/development/objects/1/1/1/file.txt',
    'https://app.example/uploads/2026/10/29/file.txt?redirect=1',
  ])(
    'does not turn the download endpoint into an arbitrary file/URL reader: %s',
    async (url) => {
      const service = new UploadsService({
        getConfig: jest.fn().mockResolvedValue({
          enabled: false,
          provider: 'local',
          publicBaseUrl: '',
        }),
      } as never);
      await expect(
        service.readLegacyUpload(url, 'https://app.example'),
      ).rejects.toThrow();
    },
  );

  it('keeps task input files local even when OSS is enabled', async () => {
    const config: StorageConfig = {
      enabled: true,
      provider: 'aliyun-oss',
      publicBaseUrl: 'https://cdn.example.com',
      bucket: 'bucket',
      region: 'oss-cn-hangzhou',
      endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
      accessKeyId: 'key',
      accessKeySecret: 'secret',
      uploadDir: 'uploads',
      updatedAt: '',
    };
    const service = new UploadsService({
      getConfig: jest.fn().mockResolvedValue(config),
    } as never);

    const target = await service.reserveManagedFile(
      {
        buffer: Buffer.from('video'),
        originalname: 'pose.mp4',
        mimetype: 'video/mp4',
        size: 5,
      },
      {
        scope: 'comfyui',
        ownerId: 7,
        businessId: 21,
        revision: 1,
        storagePolicy: 'local',
      },
    );

    expect(target.provider).toBe('local');
    expect(target.objectKey).toMatch(
      /^comfyui\/[a-z0-9_-]+\/objects\/7\/21\/1\/.+\.mp4$/,
    );
    expect(target.url).toBe(`/uploads/${target.objectKey}`);
    expect(target.url).not.toContain('cdn.example.com');
  });
});
