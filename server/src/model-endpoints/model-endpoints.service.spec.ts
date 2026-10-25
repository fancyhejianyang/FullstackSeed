import { ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Like, type Repository } from 'typeorm';
import {
  CreateModelEndpointDto,
  QueryModelEndpointDto,
} from './dto/model-endpoint.dto';
import { ModelEndpoint } from './entities/model-endpoint.entity';
import { detectModelPlatform } from './model-endpoint.constants';
import { MODEL_ENDPOINT_PRESETS } from './model-endpoint.presets';
import { ModelEndpointsService } from './model-endpoints.service';

function harness() {
  const rows: ModelEndpoint[] = [];
  const repository = {
    create: jest.fn((value: Partial<ModelEndpoint>) =>
      Object.assign(new ModelEndpoint(), value),
    ),
    save: jest.fn((row: ModelEndpoint) => {
      row.id ||= rows.length + 1;
      rows.push(row);
      return Promise.resolve(row);
    }),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    find: jest.fn().mockResolvedValue([]),
  };
  const service = new ModelEndpointsService(
    repository as unknown as Repository<ModelEndpoint>,
  );
  return { service, repository, rows };
}
const preset = (): CreateModelEndpointDto => ({
  platformType: 'tencentTokenhub',
  modelCode: 'seedream-image-v5.0-pro',
  modelName: 'Seedream',
  functionType: 'textToImage',
  protocol: 'tokenhubSeedreamImage',
  apiPath: '/v1/wand/si-image/generation',
  executionMode: 'sync',
  isActive: true,
});

describe('模型平台识别', () => {
  it.each([
    ['https://tokenhub.tencentmaas.com/v1', 'tencentTokenhub'],
    ['https://TOKENHUB.TENCENTMAAS.COM./v1', 'tencentTokenhub'],
    ['https://tokenhub-intl.tencentcloudmaas.com/v1', 'tencentTokenhub'],
    ['https://dashscope.aliyuncs.com/compatible-mode/v1', 'aliyunBailian'],
    ['https://dashscope-intl.aliyuncs.com/api/v1', 'aliyunBailian'],
    ['https://dashscope-us.aliyuncs.com/compatible-mode/v1', 'aliyunBailian'],
    [
      'https://cn-hongkong.dashscope.aliyuncs.com/compatible-mode/v1',
      'aliyunBailian',
    ],
    ['https://workspace.cn-beijing.maas.aliyuncs.com/api/v1', 'aliyunBailian'],
    [
      'https://workspace.ap-southeast-1.maas.aliyuncs.com/api/v1',
      'aliyunBailian',
    ],
    ['https://proxy.example/https://dashscope.aliyuncs.com', 'custom'],
    ['https://tokenhub.tencentmaas.com.evil.example/v1', 'custom'],
    ['https://dashscope.aliyuncs.com@evil.example/v1', 'custom'],
    ['https://fake-aliyuncs.example/v1', 'custom'],
    ['https://evil.maas.aliyuncs.com/v1', 'custom'],
    ['not-a-url', 'custom'],
    ['', 'custom'],
  ])('%s → %s', (value, platform) =>
    expect(detectModelPlatform(value)).toBe(platform),
  );
});

describe('模型调用接口配置', () => {
  it('按平台/模型/功能生成唯一键，不返回内部唯一键，不包含草稿或说明字段', async () => {
    const { service, rows } = harness();
    const view = await service.create(preset());
    expect(rows[0].routeKey).toBe(
      'tencentTokenhub:seedream-image-v5.0-pro:textToImage',
    );
    expect(view).not.toHaveProperty('routeKey');
    expect(view).not.toHaveProperty('description');
    expect(view).not.toHaveProperty('status');
  });
  it('数据库唯一约束冲突转为可读错误', async () => {
    const { service, repository } = harness();
    repository.save.mockRejectedValueOnce(
      Object.assign(new Error(), { code: 'ER_DUP_ENTRY' }),
    );
    await expect(service.create(preset())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  it('一个模型允许分别配置文生图和参考生图', async () => {
    const { service, rows } = harness();
    await service.create(preset());
    await service.create({ ...preset(), functionType: 'imageToImage' });
    expect(rows[0].routeKey).not.toBe(rows[1].routeKey);
  });
  it.each([
    '//evil.example/path',
    'https://evil.example/generation',
    '/v1/../secret',
    '/v1/%2e%2e/secret',
    '/v1/a?token=x',
    '/v1/a#x',
  ])('拒绝非安全相对路径 %s', async (apiPath) => {
    await expect(
      harness().service.create({ ...preset(), apiPath }),
    ).rejects.toThrow('路径');
  });
  it('异步必须有查询模板，同步会清理无效查询地址', async () => {
    const { service } = harness();
    await expect(
      service.create({
        ...preset(),
        protocol: 'tokenhubViduImage',
        executionMode: 'async',
        taskApiPath: '',
      }),
    ).rejects.toThrow('路径');
    await expect(
      service.create({ ...preset(), taskApiPath: '/unneeded' }),
    ).resolves.toMatchObject({ taskApiPath: '' });
  });
  it('拒绝场景/协议、平台/协议和执行方式不匹配', async () => {
    const { service } = harness();
    await expect(
      service.create({ ...preset(), functionType: 'vision' }),
    ).rejects.toThrow('不匹配');
    await expect(
      service.create({ ...preset(), platformType: 'aliyunBailian' }),
    ).rejects.toThrow('不属于');
    await expect(
      service.create({ ...preset(), executionMode: 'async' }),
    ).rejects.toThrow('不匹配');
  });
  it('停用卡片明确阻止解析，不回退供应商默认地址', async () => {
    const { service, repository } = harness();
    repository.findOne.mockResolvedValueOnce({ ...preset(), isActive: false });
    await expect(
      service.resolve('tencentTokenhub', preset().modelCode, 'textToImage'),
    ).rejects.toThrow('停用');
  });
  it('生成及查询路径基于账号同域名拼接，不重复 /v1 或泄漏凭据', () => {
    const { service } = harness();
    expect(
      service.buildUrl(
        'https://tokenhub.tencentmaas.com/v1/chat/completions',
        preset().apiPath,
      ),
    ).toBe('https://tokenhub.tencentmaas.com/v1/wand/si-image/generation');
    expect(
      service.buildUrl(
        'https://tokenhub-intl.tencentcloudmaas.com/v1',
        '/v1/wand/vidu-image/tasks/{taskId}',
      ),
    ).toBe(
      'https://tokenhub-intl.tencentcloudmaas.com/v1/wand/vidu-image/tasks/{taskId}',
    );
    expect(() =>
      service.buildUrl('https://user:password@proxy.example', '/generate'),
    ).toThrow('HTTPS');
  });
  it('查询过滤布尔 false 与分页参数保留', async () => {
    const { service, repository } = harness();
    await service.findAll({
      page: 2,
      pageSize: 12,
      isActive: false,
      platformType: 'tencentTokenhub',
      functionType: 'textToImage',
      keyword: 'seed',
    });
    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 12,
        take: 12,
        where: [
          {
            isActive: false,
            platformType: 'tencentTokenhub',
            functionType: 'textToImage',
            modelCode: Like('%seed%'),
          },
          {
            isActive: false,
            platformType: 'tencentTokenhub',
            functionType: 'textToImage',
            modelName: Like('%seed%'),
          },
        ],
      }),
    );
  });
  it('所有初始预设通过同一业务校验', async () => {
    const { service } = harness();
    for (const item of MODEL_ENDPOINT_PRESETS)
      await expect(service.create(item)).resolves.toMatchObject({
        modelCode: item.modelCode,
        functionType: item.functionType,
      });
  });
  it('重启不覆盖已编辑/停用/软删除过的预设', async () => {
    const { service, repository } = harness();
    repository.findOne.mockResolvedValue({
      id: 1,
      isActive: false,
      deletedAt: new Date(),
    });
    await service.onModuleInit();
    expect(repository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ withDeleted: true }),
    );
    expect(repository.save).not.toHaveBeenCalled();
  });
  it('查询 DTO 转换 false 并限制页大小', async () => {
    const valid = plainToInstance(QueryModelEndpointDto, {
      isActive: 'false',
      page: '2',
      pageSize: '12',
    });
    expect(await validate(valid)).toHaveLength(0);
    expect(valid.isActive).toBe(false);
    expect(
      await validate(
        plainToInstance(QueryModelEndpointDto, { pageSize: '10000' }),
      ),
    ).not.toHaveLength(0);
  });
});
