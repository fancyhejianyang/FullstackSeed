import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Like } from 'typeorm';
import { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import { QueryAiFeatureConfigDto } from '../ai-feature-configs/dto/ai-feature-config.dto';
import { DataImportService } from '../data-import/data-import.service';
import { DemoService } from '../demo/demo.service';
import { KnowledgeAiChatService } from '../knowledge-ai-chat/knowledge-ai-chat.service';

function createRepositoryMock() {
  return {
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
}

describe('列表组合筛选', () => {
  it('将 URL 中的 false 转换为布尔值且通过校验', async () => {
    const dto = plainToInstance(QueryAiFeatureConfigDto, {
      isEnabled: 'false',
    });

    expect(dto.isEnabled).toBe(false);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('AI 功能配置保留 false 状态条件', async () => {
    const repository = createRepositoryMock();
    const service = new AiFeatureConfigsService(
      repository as never,
      null as never,
      null as never,
    );

    await service.findAll({ isEnabled: false });

    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isEnabled: false } }),
    );
  });

  it('示例列表按状态查询', async () => {
    const repository = createRepositoryMock();
    const service = new DemoService(repository as never);

    await service.findAll({ status: 'published' });

    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'published' } }),
    );
  });

  it('数据导入列表按模板扩展名查询', async () => {
    const repository = createRepositoryMock();
    const service = new DataImportService(repository as never);

    await service.findAll({ templateType: 'csv' });

    expect(repository.findAndCount).toHaveBeenCalledWith({
      where: { templateName: Like('%.csv') },
      order: { createdAt: 'DESC' },
      skip: 0,
      take: 10,
    });
  });

  it('问题记录保留失败状态条件', async () => {
    const repository = createRepositoryMock();
    const service = new KnowledgeAiChatService(
      repository as never,
      null as never,
      null as never,
      null as never,
      null as never,
    );

    await service.findSessions({ isSuccess: false });

    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isSuccess: false } }),
    );
  });
});
