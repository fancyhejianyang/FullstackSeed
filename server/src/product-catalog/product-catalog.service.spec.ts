import type { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { ProductSku } from './entities/product-sku.entity';
import { ProductCatalogService } from './product-catalog.service';

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
});
