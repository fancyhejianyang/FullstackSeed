import request from '@/utils/request';

export interface ProductImportResult {
  importedCount: number;
  errors: Array<{ row: number; message: string }>;
}

export function downloadProductTemplate() {
  return request.get<unknown, Blob>('/products/template', { responseType: 'blob' });
}

export function importProducts(file: File) {
  const data = new FormData();
  data.append('file', file);
  return request.post<unknown, ProductImportResult>('/products/import', data, { timeout: 120000 });
}

export interface Product {
  id: number;
  productCode: string;
  name: string;
  aliases: string[] | null;
  category: string;
  description: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductSku {
  id: number;
  productId: number;
  productName?: string;
  productCode?: string;
  skuCode: string;
  name: string;
  specifications: Record<string, unknown>;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductOption {
  id: number;
  productCode: string;
  name: string;
}

export interface ProductListResult {
  list: Product[];
  total: number;
}

export interface ProductSkuListResult {
  list: ProductSku[];
  total: number;
}

export interface QueryProductParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  isEnabled?: boolean | '';
}

export interface QueryProductSkuParams extends QueryProductParams {
  productId?: number | '';
}

export interface ProductForm {
  productCode: string;
  name: string;
  aliases?: string[];
  category?: string;
  description?: string;
  isEnabled: boolean;
}

export interface ProductSkuForm {
  productId: number;
  skuCode?: string;
  name?: string;
  specifications: Record<string, unknown>;
  isEnabled: boolean;
}

export function getNextSkuCode(productId: number) {
  return request.get<unknown, { skuCode: string }>(`/products/${productId}/next-sku-code`);
}

export function getProducts(params: QueryProductParams) {
  return request.get<unknown, ProductListResult>('/products', { params });
}

export function getProductOptions() {
  return request.get<unknown, ProductOption[]>('/products/options');
}

export function getProduct(id: number) {
  return request.get<unknown, Product>(`/products/${id}`);
}

export function createProduct(data: ProductForm) {
  return request.post<unknown, Product>('/products', data);
}

export function updateProduct(id: number, data: Partial<ProductForm>) {
  return request.patch<unknown, Product>(`/products/${id}`, data);
}

export function deleteProduct(id: number) {
  return request.delete<unknown, { id: number }>(`/products/${id}`);
}

export function batchDeleteProducts(ids: Array<number | string>) {
  return request.post<unknown, { ids: number[] }>('/products/batch-delete', {
    ids: ids.map(Number),
  });
}

export function getProductSkus(params: QueryProductSkuParams) {
  return request.get<unknown, ProductSkuListResult>('/product-skus', { params });
}

export function getProductSku(id: number) {
  return request.get<unknown, ProductSku>(`/product-skus/${id}`);
}

export function createProductSku(data: ProductSkuForm) {
  return request.post<unknown, ProductSku>('/product-skus', data);
}

export function updateProductSku(id: number, data: ProductSkuForm) {
  return request.patch<unknown, ProductSku>(`/product-skus/${id}`, data);
}

export function deleteProductSku(id: number) {
  return request.delete<unknown, { id: number }>(`/product-skus/${id}`);
}

export function batchDeleteProductSkus(ids: Array<number | string>) {
  return request.post<unknown, { ids: number[] }>('/product-skus/batch-delete', {
    ids: ids.map(Number),
  });
}
