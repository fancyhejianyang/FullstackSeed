import { Repository } from 'typeorm';
import { ComfyClientService } from './comfy-client.service';
import { ComfyConnectionsService } from './comfy-connections.service';
import { ComfyConnection } from './entities/comfy-connection.entity';
import { ComfyWorkflow } from './entities/comfy-workflow.entity';

function createService(existing: Partial<ComfyConnection> = {}) {
  const connection = {
    id: 1,
    name: '本机 ComfyUI',
    baseUrl: 'http://127.0.0.1:8188',
    authType: 'none',
    username: null,
    secret: null,
    isEnabled: true,
    isDefault: true,
    ...existing,
  } as ComfyConnection;
  const queryBuilder = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(connection),
  };
  const connections = {
    exists: jest.fn().mockResolvedValue(false),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn().mockResolvedValue(undefined),
    create: jest.fn((value: Partial<ComfyConnection>) => value),
    save: jest.fn((value: Partial<ComfyConnection>) => {
      Object.assign(connection, value);
      return Promise.resolve(connection);
    }),
    findOne: jest.fn().mockResolvedValue(connection),
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
  };
  const service = new ComfyConnectionsService(
    connections as unknown as Repository<ComfyConnection>,
    {} as Repository<ComfyWorkflow>,
    {} as ComfyClientService,
  );
  return { service, connections };
}

describe('ComfyConnectionsService', () => {
  it('新建首个服务时使用明确条件清除旧默认项', async () => {
    const { service, connections } = createService();

    await service.create({
      name: '本机 ComfyUI',
      baseUrl: 'http://127.0.0.1:8188',
      authType: 'none',
    });

    expect(connections.update).toHaveBeenCalledWith(
      { isDefault: true },
      { isDefault: false },
    );
  });

  it('编辑并设为默认服务时不使用 TypeORM 禁止的空更新条件', async () => {
    const { service, connections } = createService({
      id: 2,
      isDefault: false,
    });

    await service.update(2, { isDefault: true });

    expect(connections.update).toHaveBeenCalledWith(
      { isDefault: true },
      { isDefault: false },
    );
    expect(connections.update).not.toHaveBeenCalledWith({}, expect.anything());
  });

  it('允许使用官方 Comfy Cloud API Key 并规范化 /api 地址', async () => {
    const { service, connections } = createService();

    await service.create({
      name: '云端 ComfyUI',
      baseUrl: 'https://cloud.comfy.org/api/',
      authType: 'apiKey',
      secret: 'cloud-token',
    });

    expect(connections.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '云端 ComfyUI',
        baseUrl: 'https://cloud.comfy.org',
        authType: 'apiKey',
        secret: 'cloud-token',
      }),
    );
  });

  it('官方 Comfy Cloud 未配置 API Key 时给出明确错误', async () => {
    const { service } = createService();

    await expect(
      service.create({
        name: '云端 ComfyUI',
        baseUrl: 'https://cloud.comfy.org',
        authType: 'none',
      }),
    ).rejects.toThrow('Comfy Cloud 需要使用 API Key（X-API-Key）认证');
  });

  it('公网服务使用明文 HTTP 时给出明确错误', async () => {
    const { service } = createService();

    await expect(
      service.create({
        name: '不安全的云端 ComfyUI',
        baseUrl: 'http://cloud.comfy.org',
        authType: 'none',
      }),
    ).rejects.toThrow('公网 ComfyUI 服务地址必须使用 HTTPS');
  });
});
