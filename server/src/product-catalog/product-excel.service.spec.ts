import { Workbook } from 'exceljs';
import type { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import {
  ProductExcelService,
  PRODUCT_TEMPLATE_HEADERS,
} from './product-excel.service';

describe('ProductExcelService', () => {
  const repository = {
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((value: unknown) => value),
    save: jest.fn().mockResolvedValue([]),
  };
  const transaction = jest.fn(async (callback: (manager: unknown) => unknown) =>
    callback({ getRepository: () => repository }),
  );
  const service = new ProductExcelService({
    manager: { transaction },
  } as unknown as Repository<Product>);

  async function file(rows: unknown[][], headers = PRODUCT_TEMPLATE_HEADERS) {
    const workbook = new Workbook();
    workbook.addWorksheet('产品列表').addRows([headers, ...rows]);
    return {
      originalname: '产品导入模板.xlsx',
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    repository.find.mockResolvedValue([]);
  });

  it('exports a blank Chinese template that can be filled and imported without codes', async () => {
    const workbook = new Workbook();
    await workbook.xlsx.load((await service.createTemplate()) as never);
    const sheet = workbook.getWorksheet('产品列表')!;
    expect(sheet.getRow(1).values).toEqual([
      undefined,
      ...PRODUCT_TEMPLATE_HEADERS,
    ]);
    expect(sheet.getRow(2).hasValues).toBe(false);
    sheet.getRow(2).values = [
      '空气净化器',
      '净化机、清新机',
      '家电',
      '静电吸附',
      '',
    ];
    const result = await service.importProducts({
      originalname: '产品.xlsx',
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    });
    expect(result).toEqual({ importedCount: 1, errors: [] });
    expect(repository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        name: '空气净化器',
        aliases: ['净化机', '清新机'],
        isEnabled: true,
        productCode: expect.stringMatching(/^P[0-9a-f]{32}$/),
      }),
    ]);
  });

  it('reports invalid rows and writes none of the valid rows', async () => {
    const result = await service.importProducts(
      await file([
        ['正常产品', '', '', '', '是'],
        ['', '', '', '', '启用'],
      ]),
    );
    expect(result.importedCount).toBe(0);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ row: 3 })]),
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects duplicated file rows and existing products', async () => {
    expect(
      (await service.importProducts(await file([['仪表'], ['仪表']]))).errors[0]
        .row,
    ).toBe(3);
    repository.find.mockResolvedValue([{ name: '仪表', category: '' }]);
    expect(
      (await service.importProducts(await file([['仪表']]))).errors[0].message,
    ).toContain('已存在');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects formulas even with a cached result', async () => {
    const result = await service.importProducts(
      await file([[{ formula: '"仪表"', result: '仪表' }]]),
    );
    expect(result.errors[0].message).toContain('公式');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects extra code columns and missing headers', async () => {
    expect(
      (
        await service.importProducts(
          await file([['仪表']], [...PRODUCT_TEMPLATE_HEADERS, '编号']),
        )
      ).errors[0].row,
    ).toBe(1);
    expect(
      (await service.importProducts(await file([['仪表']], ['产品名称'])))
        .errors.length,
    ).toBe(4);
  });

  it('allows equal names in different categories and disabled products', async () => {
    const result = await service.importProducts(
      await file([
        ['仪表', '', '压力', '', '否'],
        ['仪表', '', '温度'],
      ]),
    );
    expect(result.importedCount).toBe(2);
    expect(repository.save.mock.calls[0][0][0].isEnabled).toBe(false);
  });

  it('rejects empty templates, wrong files and excessive rows', async () => {
    await expect(service.importProducts()).rejects.toThrow('.xlsx');
    await expect(
      service.importProducts({
        originalname: '产品.xlsx',
        buffer: Buffer.from('invalid'),
      }),
    ).rejects.toThrow('无法读取');
    await expect(service.importProducts(await file([]))).rejects.toThrow(
      '没有可导入',
    );
    await expect(
      service.importProducts(
        await file(Array.from({ length: 1001 }, (_, i) => [`产品${i}`])),
      ),
    ).rejects.toThrow('1000');
  });
});
