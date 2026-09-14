import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { KnowledgeChunkConfig } from '../knowledge-chunk-configs/entities/knowledge-chunk-config.entity';
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

describe('KnowledgeBasesService structured markdown parsing', () => {
  const service = Object.create(KnowledgeBasesService.prototype) as {
    resolveParseMode: (mode?: string | null) => string;
    buildDocumentParseSystemPrompt: (prompt?: string | null) => string;
    normalizeKnowledgeMarkdown: (
      content: string,
      title?: string | null,
    ) => string;
    splitMarkdown: (
      content: string,
      config: KnowledgeChunkConfig,
      deadline: number,
      documentTitle: string,
    ) => Array<{
      title: string;
      sectionPath: string | null;
      blockType: string;
      content: string;
      coreContent: string;
    }>;
  };

  const chunkConfig = {
    chunkSize: 800,
    chunkOverlap: 0,
    separator: 'paragraph',
    preserveHeading: true,
  } as KnowledgeChunkConfig;

  it('forces parsing through the structured AI path and appends Markdown rules', () => {
    expect(service.resolveParseMode('manual')).toBe('ai');

    const prompt =
      service.buildDocumentParseSystemPrompt('保留产品型号和单位。');
    expect(prompt).toContain('保留产品型号和单位。');
    expect(prompt).toContain('输出必须是可直接用于知识库分片的 Markdown 正文');
    expect(prompt).toContain('不得补充、猜测或编造');
  });

  it('keeps Markdown heading paths and tables as structured chunks', () => {
    const chunks = service.splitMarkdown(
      [
        '# 售后服务',
        '',
        '## 退货退款',
        '',
        '商品需保持完好，并在签收后七日内申请。',
        '',
        '| 条件 | 要求 |',
        '| --- | --- |',
        '| 时间 | 七日内 |',
      ].join('\n'),
      chunkConfig,
      Date.now() + 1_000,
      '客服资料',
    );

    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: '客服资料 · 售后服务 > 退货退款',
          sectionPath: '售后服务 > 退货退款',
          blockType: 'paragraph',
        }),
        expect.objectContaining({
          sectionPath: '售后服务 > 退货退款',
          blockType: 'table',
          content: expect.stringContaining('| 条件 | 要求 |'),
        }),
      ]),
    );
  });

  it('wraps unstructured parser output in a Markdown document heading', () => {
    expect(service.normalizeKnowledgeMarkdown('第一段内容', '产品手册')).toBe(
      '# 产品手册\n\n第一段内容',
    );
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
