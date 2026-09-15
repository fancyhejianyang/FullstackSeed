import type { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { ProductSku } from './entities/product-sku.entity';
import { ProductCatalogService } from './product-catalog.service';

describe('SKU automatic codes', () => {
  const products = { findOne: jest.fn() };
  const skus = {
    find: jest.fn(), findOne: jest.fn(), create: jest.fn(() => ({})),
    save: jest.fn(async (value: unknown) => value),
    manager: { transaction: jest.fn() },
  };
  const service = new ProductCatalogService(products as unknown as Repository<Product>, skus as unknown as Repository<ProductSku>);
  beforeEach(() => {
    jest.clearAllMocks();
    products.findOne.mockResolvedValue({ id: 1, productCode: 'PROD' });
    skus.find.mockResolvedValue([]);
    skus.findOne.mockResolvedValue(null);
    skus.manager.transaction.mockImplementation(async (callback: (manager: unknown) => unknown) => callback({ getRepository: (entity: unknown) => entity === Product ? products : skus }));
  });

  it('previews the first code without reserving or saving', async () => {
    await expect(service.nextSkuCode(1)).resolves.toEqual({ skuCode: 'PROD-001' });
    expect(skus.save).not.toHaveBeenCalled();
  });

  it('allocates after numeric maximum, including deleted rows and ignoring custom codes', async () => {
    skus.find.mockResolvedValue([{ skuCode: 'PROD-009' }, { skuCode: 'PROD-1000', deletedAt: new Date() }, { skuCode: 'PROD-BLUE' }]);
    await expect(service.createSku({ productId: 1, specifications: {} })).resolves.toMatchObject({ skuCode: 'PROD-1001', productId: 1 });
    expect(products.findOne).toHaveBeenCalledWith(expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
    expect(skus.find).toHaveBeenCalledWith(expect.objectContaining({ withDeleted: true }));
    expect(skus.manager.transaction).toHaveBeenCalledTimes(1);
  });

  it('keeps the code when editing the same product', async () => {
    skus.findOne.mockResolvedValue({ id: 2, productId: 1, skuCode: 'LEGACY' });
    await expect(service.updateSku(2, { productId: 1, name: '新规格' })).resolves.toMatchObject({ skuCode: 'LEGACY', name: '新规格' });
    expect(skus.find).not.toHaveBeenCalled();
  });

  it('generates from the new product when moving a SKU', async () => {
    skus.findOne.mockResolvedValueOnce({ id: 2, productId: 9, skuCode: 'OLD-001' }).mockResolvedValueOnce(null);
    await expect(service.updateSku(2, { productId: 1 })).resolves.toMatchObject({ skuCode: 'PROD-001', productId: 1 });
  });

  it('rejects a manually supplied code already used by a deleted SKU', async () => {
    skus.findOne.mockResolvedValue({ id: 9, skuCode: 'LEGACY', deletedAt: new Date() });
    await expect(service.createSku({ productId: 1, skuCode: 'LEGACY', specifications: {} })).rejects.toThrow('已存在');
    expect(skus.save).not.toHaveBeenCalled();
  });

  it('matches custom parameter values when selecting a SKU for chat', async () => {
    const productRepository = { find: jest.fn().mockResolvedValue([{ id: 1, productCode: 'PROD', name: '仪表', aliases: [] }]) };
    const skuRepository = { find: jest.fn().mockResolvedValue([
      { id: 1, skuCode: 'PROD-001', name: '', specifications: { ratedVoltage: { label: '额定电压', value: '110伏' } } },
      { id: 2, skuCode: 'PROD-002', name: '', specifications: { ratedVoltage: { label: '额定电压', value: '220伏' } } },
    ]) };
    const chatService = new ProductCatalogService(productRepository as unknown as Repository<Product>, skuRepository as unknown as Repository<ProductSku>);
    const context = await chatService.findSkuContextForChat('仪表220伏的参数');
    expect(context?.sku?.skuCode).toBe('PROD-002');
  });
});
