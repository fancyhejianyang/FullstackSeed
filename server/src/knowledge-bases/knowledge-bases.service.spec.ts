import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryKnowledgeBaseDto } from './dto/knowledge-base.dto';
import { KnowledgeBasesService } from './knowledge-bases.service';

interface QueryBuilderMock {
  orderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  getManyAndCount: jest.Mock;
}

describe('KnowledgeBasesService list filters', () => {
  it('converts the disabled query value to boolean false', async () => {
    const dto = plainToInstance(QueryKnowledgeBaseDto, {
      contentType: 'pdf',
      processStage: 'indexed',
      isEnabled: 'false',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.isEnabled).toBe(false);
  });

  it('combines category, type, stage and disabled status filters', async () => {
    const qb = createQueryBuilderMock();
    const service = Object.create(KnowledgeBasesService.prototype) as {
      baseRepository: { createQueryBuilder: jest.Mock };
      findBases: (
        query: QueryKnowledgeBaseDto,
      ) => Promise<{ list: unknown[]; total: number }>;
    };
    service.baseRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };

    await service.findBases({
      categoryId: 2,
      contentType: 'pdf',
      processStage: 'indexed',
      isEnabled: false,
    });

    expect(qb.andWhere).toHaveBeenCalledWith('base.categoryId = :categoryId', {
      categoryId: 2,
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      'base.contentType = :contentType',
      { contentType: 'pdf' },
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      'base.processStage = :processStage',
      { processStage: 'indexed' },
    );
    expect(qb.andWhere).toHaveBeenCalledWith('base.isEnabled = :isEnabled', {
      isEnabled: false,
    });
  });
});

function createQueryBuilderMock(): QueryBuilderMock {
  const qb = {} as QueryBuilderMock;
  qb.orderBy = jest.fn().mockReturnValue(qb);
  qb.skip = jest.fn().mockReturnValue(qb);
  qb.take = jest.fn().mockReturnValue(qb);
  qb.where = jest.fn().mockReturnValue(qb);
  qb.andWhere = jest.fn().mockReturnValue(qb);
  qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  return qb;
}
