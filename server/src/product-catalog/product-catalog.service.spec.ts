import type { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { ProductSku } from './entities/product-sku.entity';
import { ProductCatalogService } from './product-catalog.service';
import { fallbackProductKeywords, sanitizeProductKeywords } from './product-search';

describe('ProductCatalogService', () => {
  const productRepository = {
    find: jest.fn(),
  };
  const skuRepository = {
    find: jest.fn(),
  };
  const service = new ProductCatalogService(
    productRepository as unknown as Repository<Product>,
    skuRepository as unknown as Repository<ProductSku>,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses a maintained product alias and a SKU specification to return one exact fact', async () => {
    productRepository.find.mockResolvedValue([
      {
        id: 1,
        productCode: 'ROBOT-PRO',
        name: '蓝虎机器人 Pro',
        aliases: ['小蓝'],
        category: '机器人',
      },
    ]);
    skuRepository.find.mockResolvedValue([
      {
        id: 11,
        productId: 1,
        skuCode: 'ROBOT-PRO-128-BLUE',
        name: '蓝色版',
        specifications: { color: '蓝色', storage: '128G', weight: '12kg' },
      },
      {
        id: 12,
        productId: 1,
        skuCode: 'ROBOT-PRO-256-BLUE',
        name: '蓝色版',
        specifications: { color: '蓝色', storage: '256G', weight: '12.3kg' },
      },
    ]);

    await expect(
      service.findSkuContextForChat('小蓝 256G 多重？'),
    ).resolves.toEqual(
      expect.objectContaining({
        matchType: 'sku',
        product: expect.objectContaining({ name: '蓝虎机器人 Pro' }),
        sku: expect.objectContaining({
          skuCode: 'ROBOT-PRO-256-BLUE',
          specifications: expect.objectContaining({ weight: '12.3kg' }),
        }),
        candidateSkus: [],
      }),
    );
  });

  it('returns candidates instead of guessing when one product has multiple SKU variants', async () => {
    productRepository.find.mockResolvedValue([
      {
        id: 1,
        productCode: 'ROBOT-PRO',
        name: '蓝虎机器人 Pro',
        aliases: ['小蓝'],
        category: '机器人',
      },
    ]);
    skuRepository.find.mockResolvedValue([
      {
        id: 11,
        productId: 1,
        skuCode: 'ROBOT-PRO-128-BLUE',
        name: '蓝色版',
        specifications: { storage: '128G' },
      },
      {
        id: 12,
        productId: 1,
        skuCode: 'ROBOT-PRO-256-BLUE',
        name: '蓝色版',
        specifications: { storage: '256G' },
      },
    ]);

    await expect(service.findSkuContextForChat('小蓝多少钱？')).resolves.toEqual(
      expect.objectContaining({
        matchType: 'product',
        sku: null,
        candidateSkus: [
          expect.objectContaining({ skuCode: 'ROBOT-PRO-128-BLUE' }),
          expect.objectContaining({ skuCode: 'ROBOT-PRO-256-BLUE' }),
        ],
      }),
    );
  });

  it('matches the core word 靠枕 against a longer product name and returns its variants', async () => {
    productRepository.find.mockResolvedValue([
      { id: 40, productCode: 'P40', name: '云朵 记忆棉靠枕', aliases: ['云朵靠枕'], category: '家居生活' },
      { id: 58, productCode: 'P58', name: '卷尺', aliases: ['钢卷尺'], category: '测量工具' },
    ]);
    skuRepository.find.mockResolvedValue([
      { id: 5, skuCode: 'P40-001', name: '标准款黑色', specifications: {} },
      { id: 6, skuCode: 'P40-002', name: '标准款灰色', specifications: {} },
      { id: 7, skuCode: 'P40-003', name: '清凉凝胶款灰色', specifications: {} },
    ]);
    const result = await service.findSkuContextForChat('我还想要个睡觉用的靠枕，有哪些款式给我选择？', ['靠枕']);
    expect(result).toMatchObject({ matchType: 'product', product: { id: 40 }, sku: null });
    expect(result?.candidateSkus).toHaveLength(3);
    expect(productRepository.find).toHaveBeenCalledWith({ where: { isEnabled: true }, take: 5000 });
    expect(skuRepository.find).toHaveBeenCalledWith({ where: { productId: 40, isEnabled: true }, order: { id: 'ASC' } });
  });

  it('does not choose an arbitrary product when a partial keyword matches multiple products', async () => {
    productRepository.find.mockResolvedValue([
      { id: 40, productCode: 'P40', name: '云朵记忆棉靠枕', aliases: [], category: '家居生活' },
      { id: 41, productCode: 'P41', name: '舒适靠枕', aliases: [], category: '家居生活' },
    ]);
    skuRepository.find.mockResolvedValue([]);
    expect(await service.findSkuContextForChat('靠枕有哪些？', ['靠枕'])).toMatchObject({
      matchType: 'products', product: null, sku: null, totalProducts: 2,
      candidateProducts: expect.arrayContaining([
        expect.objectContaining({ product: expect.objectContaining({ id: 40 }) }),
        expect.objectContaining({ product: expect.objectContaining({ id: 41 }) }),
      ]),
    });
  });

  it('continues to match 卷尺 by its full name without requiring extracted keywords', async () => {
    productRepository.find.mockResolvedValue([
      { id: 58, productCode: 'P58', name: '卷尺', aliases: ['钢卷尺'], category: '测量工具' },
    ]);
    skuRepository.find.mockResolvedValue([
      { id: 19, skuCode: 'P58-001', name: '3米×19毫米', specifications: { weight: '160g' } },
      { id: 20, skuCode: 'P58-002', name: '5米×22毫米', specifications: { weight: '252g' } },
    ]);
    expect(await service.findSkuContextForChat('我想买一把卷尺，家庭个人偶尔使用')).toMatchObject({
      matchType: 'product', product: { id: 58 }, sku: null,
    });
  });

  it('returns no match for an unrelated word and discards keywords invented by a model', async () => {
    productRepository.find.mockResolvedValue([
      { id: 40, productCode: 'P40', name: '云朵记忆棉靠枕', aliases: [], category: '家居生活' },
    ]);
    expect(await service.findSkuContextForChat('有没有电饭煲？', ['电饭煲', '靠枕'])).toBeNull();
    expect(skuRepository.find).not.toHaveBeenCalled();
  });

  it('keeps multiple SKU candidates when a common specification matches both', async () => {
    productRepository.find.mockResolvedValue([
      { id: 40, productCode: 'P40', name: '靠枕', aliases: [], category: '家居生活' },
    ]);
    skuRepository.find.mockResolvedValue([
      { id: 5, skuCode: 'P40-001', name: '标准款', specifications: { color: '灰色' } },
      { id: 6, skuCode: 'P40-002', name: '凝胶款', specifications: { color: '灰色' } },
    ]);
    expect(await service.findSkuContextForChat('灰色靠枕', ['靠枕'])).toMatchObject({ matchType: 'product', sku: null });
  });

  it('falls back to local keywords without treating conversational fillers as products', () => {
    const question = '我还想要个睡觉用的靠枕，有哪些款式给我选择？';
    expect(fallbackProductKeywords(question)).toContain('靠枕');
    expect(fallbackProductKeywords(question)).not.toContain('睡觉');
    expect(fallbackProductKeywords('你们没有靠枕么？')).toEqual(['靠枕']);
    expect(sanitizeProductKeywords(['靠枕', '卷尺', '靠', '款式', '%'], question)).toEqual(['靠枕']);
  });
});
