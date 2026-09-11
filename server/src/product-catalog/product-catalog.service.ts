import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import {
  CreateProductDto,
  CreateProductSkuDto,
  QueryProductDto,
  QueryProductSkuDto,
  UpdateProductDto,
  UpdateProductSkuDto,
} from './dto/product-catalog.dto';
import { Product } from './entities/product.entity';
import { ProductSku } from './entities/product-sku.entity';

export interface ProductSkuChatContext {
  matchType: 'sku' | 'product';
  product: {
    id: number;
    productCode: string;
    name: string;
    aliases: string[];
    category: string;
  };
  sku: {
    id: number;
    skuCode: string;
    name: string;
    specifications: Record<string, unknown>;
  } | null;
  candidateSkus: Array<{
    id: number;
    skuCode: string;
    name: string;
    specifications: Record<string, unknown>;
  }>;
}

@Injectable()
export class ProductCatalogService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductSku)
    private readonly skuRepository: Repository<ProductSku>,
  ) {}

  async findProducts(query: QueryProductDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const baseWhere =
      query.isEnabled === undefined ? {} : { isEnabled: query.isEnabled };
    const keyword = query.keyword?.trim();
    const where = keyword
      ? [
          { ...baseWhere, productCode: Like(`%${keyword}%`) },
          { ...baseWhere, name: Like(`%${keyword}%`) },
          { ...baseWhere, category: Like(`%${keyword}%`) },
        ]
      : baseWhere;
    const [list, total] = await this.productRepository.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total };
  }

  async findProductOptions() {
    const list = await this.productRepository.find({
      where: { isEnabled: true },
      order: { name: 'ASC', id: 'ASC' },
      take: 1000,
    });
    return list.map((item) => ({
      id: item.id,
      productCode: item.productCode,
      name: item.name,
    }));
  }

  async findProduct(id: number) {
    const product = await this.productRepository.findOne({ where: { id } });
    if (!product) throw new NotFoundException('产品不存在');
    return product;
  }

  async createProduct(dto: CreateProductDto) {
    const productCode = dto.productCode.trim();
    await this.assertProductCodeUnique(productCode);
    return this.productRepository.save(
      this.productRepository.create({
        productCode,
        name: dto.name.trim(),
        aliases: this.normalizeTexts(dto.aliases),
        category: dto.category?.trim() ?? '',
        description: this.toNullableText(dto.description),
        isEnabled: dto.isEnabled ?? true,
      }),
    );
  }

  async updateProduct(id: number, dto: UpdateProductDto) {
    const product = await this.findProduct(id);
    if (dto.productCode !== undefined) {
      const productCode = dto.productCode.trim();
      if (productCode !== product.productCode) {
        await this.assertProductCodeUnique(productCode);
      }
      product.productCode = productCode;
    }
    if (dto.name !== undefined) product.name = dto.name.trim();
    if (dto.aliases !== undefined) product.aliases = this.normalizeTexts(dto.aliases);
    if (dto.category !== undefined) product.category = dto.category.trim();
    if (dto.description !== undefined) {
      product.description = this.toNullableText(dto.description);
    }
    if (dto.isEnabled !== undefined) product.isEnabled = dto.isEnabled;
    return this.productRepository.save(product);
  }

  async removeProduct(id: number) {
    await this.findProduct(id);
    await this.productRepository.softDelete(id);
    await this.skuRepository.softDelete({ productId: id });
    return { id };
  }

  async batchRemoveProducts(ids: number[]) {
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) return { ids: [] };
    const count = await this.productRepository.count({ where: { id: In(uniqueIds) } });
    if (count !== uniqueIds.length) throw new NotFoundException('部分产品不存在');
    await this.productRepository.softDelete(uniqueIds);
    await this.skuRepository.softDelete({ productId: In(uniqueIds) });
    return { ids: uniqueIds };
  }

  async findSkus(query: QueryProductSkuDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const baseWhere = {
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.isEnabled === undefined ? {} : { isEnabled: query.isEnabled }),
    };
    const keyword = query.keyword?.trim();
    const where = keyword
      ? [
          { ...baseWhere, skuCode: Like(`%${keyword}%`) },
          { ...baseWhere, name: Like(`%${keyword}%`) },
        ]
      : baseWhere;
    const [list, total] = await this.skuRepository.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const productMap = await this.getProductMap(list.map((item) => item.productId));
    return {
      list: list.map((item) => ({
        ...item,
        productName: productMap.get(item.productId)?.name ?? '已删除产品',
        productCode: productMap.get(item.productId)?.productCode ?? '',
      })),
      total,
    };
  }

  async findSku(id: number) {
    const sku = await this.skuRepository.findOne({ where: { id } });
    if (!sku) throw new NotFoundException('SKU 不存在');
    const product = await this.findProduct(sku.productId);
    return { ...sku, productName: product.name, productCode: product.productCode };
  }

  async createSku(dto: CreateProductSkuDto) {
    await this.findProduct(dto.productId);
    const skuCode = dto.skuCode.trim();
    await this.assertSkuCodeUnique(skuCode);
    return this.skuRepository.save(
      this.skuRepository.create({
        productId: dto.productId,
        skuCode,
        name: dto.name?.trim() ?? '',
        specifications: dto.specifications,
        isEnabled: dto.isEnabled ?? true,
      }),
    );
  }

  async updateSku(id: number, dto: UpdateProductSkuDto) {
    const sku = await this.findSkuEntity(id);
    if (dto.productId !== undefined) {
      await this.findProduct(dto.productId);
      sku.productId = dto.productId;
    }
    if (dto.skuCode !== undefined) {
      const skuCode = dto.skuCode.trim();
      if (skuCode !== sku.skuCode) await this.assertSkuCodeUnique(skuCode);
      sku.skuCode = skuCode;
    }
    if (dto.name !== undefined) sku.name = dto.name.trim();
    if (dto.specifications !== undefined) sku.specifications = dto.specifications;
    if (dto.isEnabled !== undefined) sku.isEnabled = dto.isEnabled;
    return this.skuRepository.save(sku);
  }

  async removeSku(id: number) {
    await this.findSkuEntity(id);
    await this.skuRepository.softDelete(id);
    return { id };
  }

  async batchRemoveSkus(ids: number[]) {
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) return { ids: [] };
    const count = await this.skuRepository.count({ where: { id: In(uniqueIds) } });
    if (count !== uniqueIds.length) throw new NotFoundException('部分 SKU 不存在');
    await this.skuRepository.softDelete(uniqueIds);
    return { ids: uniqueIds };
  }

  /**
   * 面向聊天的只读事实查询：只返回产品与 SKU 的最小 JSON，
   * 多 SKU 未能唯一定位时返回候选项，要求回答模型提示用户补充规格。
   */
  async findSkuContextForChat(question: string): Promise<ProductSkuChatContext | null> {
    const normalizedQuestion = this.normalize(question);
    if (!normalizedQuestion) return null;
    const products = await this.productRepository.find({
      where: { isEnabled: true },
      take: 5000,
    });
    const scoredProducts = products
      .map((product) => ({ product, score: this.getProductScore(product, normalizedQuestion) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || right.product.id - left.product.id);
    const selected = scoredProducts[0]?.product;
    if (!selected) return null;

    const skus = await this.skuRepository.find({
      where: { productId: selected.id, isEnabled: true },
      order: { id: 'ASC' },
    });
    const product = {
      id: selected.id,
      productCode: selected.productCode,
      name: selected.name,
      aliases: selected.aliases ?? [],
      category: selected.category,
    };
    const candidates = skus.map((sku) => this.toSkuContext(sku));
    const scoredSkus = skus
      .map((sku) => ({ sku, score: this.getSkuScore(sku, normalizedQuestion) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.sku.id - right.sku.id);
    const matchedSku = scoredSkus[0]?.sku ?? (skus.length === 1 ? skus[0] : null);
    return {
      matchType: matchedSku ? 'sku' : 'product',
      product,
      sku: matchedSku ? this.toSkuContext(matchedSku) : null,
      candidateSkus: matchedSku ? [] : candidates.slice(0, 5),
    };
  }

  private async findSkuEntity(id: number) {
    const sku = await this.skuRepository.findOne({ where: { id } });
    if (!sku) throw new NotFoundException('SKU 不存在');
    return sku;
  }

  private async assertProductCodeUnique(productCode: string) {
    const exists = await this.productRepository.exists({ where: { productCode } });
    if (exists) throw new ConflictException('产品编码已存在');
  }

  private async assertSkuCodeUnique(skuCode: string) {
    const exists = await this.skuRepository.exists({ where: { skuCode } });
    if (exists) throw new ConflictException('SKU 编码已存在');
  }

  private async getProductMap(ids: number[]) {
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) return new Map<number, Product>();
    const products = await this.productRepository.findBy({ id: In(uniqueIds) });
    return new Map(products.map((item) => [item.id, item]));
  }

  private getProductScore(product: Product, question: string) {
    const terms = [product.productCode, product.name, ...(product.aliases ?? [])]
      .map((item) => this.normalize(item))
      .filter(Boolean);
    return Math.max(
      0,
      ...terms.map((term) => (question.includes(term) ? term.length * 100 : 0)),
    );
  }

  private getSkuScore(sku: ProductSku, question: string) {
    const terms = [sku.skuCode, sku.name]
      .concat(this.collectSpecificationTexts(sku.specifications))
      .map((item) => this.normalize(item))
      .filter((item) => item.length >= 2);
    return Math.max(
      0,
      ...terms.map((term) => (question.includes(term) ? term.length * 100 : 0)),
    );
  }

  private collectSpecificationTexts(value: Record<string, unknown>) {
    return Object.values(value).flatMap((item) => {
      if (item === null || item === undefined) return [];
      if (typeof item === 'object') return [JSON.stringify(item)];
      return [String(item)];
    });
  }

  private toSkuContext(sku: ProductSku) {
    return {
      id: sku.id,
      skuCode: sku.skuCode,
      name: sku.name,
      specifications: sku.specifications,
    };
  }

  private normalize(value: string) {
    return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
  }

  private normalizeTexts(values?: string[]) {
    const texts = Array.from(new Set((values ?? []).map((item) => item.trim()).filter(Boolean)));
    return texts.length ? texts : null;
  }

  private toNullableText(value?: string) {
    const text = value?.trim() ?? '';
    return text || null;
  }
}
