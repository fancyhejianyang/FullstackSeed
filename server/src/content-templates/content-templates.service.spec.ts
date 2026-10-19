import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { In } from 'typeorm';
import { ContentTemplatesService } from './content-templates.service';
import { ContentTemplatesController } from './content-templates.controller';
import { SaveContentTemplateDto } from './dto/content-template.dto';
import { PERMISSIONS_KEY } from '../common/decorators/require-permissions.decorator';

function setup() {
  const repository = {
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
    count: jest.fn().mockResolvedValue(0),
    softDelete: jest.fn(),
  };
  return {
    repository,
    service: new ContentTemplatesService(repository as never),
  };
}
describe('私人写作模板', () => {
  it('详情、编辑、删除、批量删除均受归属约束', async () => {
    const h = setup();
    await expect(h.service.findOne(1, 7)).rejects.toThrow('模板不存在');
    await expect(
      h.service.update(1, { name: '模板', instruction: '内容' }, 7),
    ).rejects.toThrow('模板不存在');
    await expect(h.service.remove(1, 7)).rejects.toThrow('模板不存在');
    await expect(h.service.batchRemove([1, 2], 7)).rejects.toThrow(
      '部分写作模板',
    );
    expect(h.repository.findOne).toHaveBeenCalledWith({
      where: { id: 1, userId: 7 },
    });
    expect(h.repository.count).toHaveBeenCalledWith({
      where: { id: In([1, 2]), userId: 7 },
    });
    expect(h.repository.softDelete).not.toHaveBeenCalled();
  });
  it('创建过滤客户端归属字段，列表不取大段要求', async () => {
    const h = setup();
    await h.service.create(
      {
        name: ' 名称 ',
        instruction: ' 要求 ',
        userId: 99,
      } as SaveContentTemplateDto,
      7,
    );
    expect(h.repository.save).toHaveBeenCalledWith({
      name: '名称',
      instruction: '要求',
      userId: 7,
    });
    await h.service.findAll({}, 7);
    expect(h.repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, name: true, updatedAt: true },
        where: { userId: 7 },
      }),
    );
  });
  it('名称和要求拒绝空白、超长值', async () => {
    for (const dto of [
      { name: ' ', instruction: '内容' },
      { name: 'a', instruction: ' ' },
      { name: 'a', instruction: 'x'.repeat(8001) },
    ]) {
      expect(
        (await validate(plainToInstance(SaveContentTemplateDto, dto))).length,
      ).toBeGreaterThan(0);
    }
  });
  it('CRUD 均使用独立模板权限', () => {
    for (const [method, action] of Object.entries({
      findAll: 'read',
      findOne: 'read',
      create: 'create',
      update: 'update',
      remove: 'delete',
      batchRemove: 'batchDelete',
    })) {
      expect(
        Reflect.getMetadata(
          PERMISSIONS_KEY,
          ContentTemplatesController.prototype[
            method as keyof ContentTemplatesController
          ],
        ),
      ).toEqual(['ContentTemplate.' + action]);
    }
  });
});
