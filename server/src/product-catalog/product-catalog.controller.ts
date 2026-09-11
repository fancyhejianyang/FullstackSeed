import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import {
  BatchDeleteProductDto,
  BatchDeleteProductSkuDto,
  CreateProductDto,
  CreateProductSkuDto,
  QueryProductDto,
  QueryProductSkuDto,
  UpdateProductDto,
  UpdateProductSkuDto,
} from './dto/product-catalog.dto';
import { ProductCatalogService } from './product-catalog.service';

@ApiTags('ProductCatalog')
@ApiBearerAuth()
@Controller()
export class ProductCatalogController {
  constructor(private readonly productCatalogService: ProductCatalogService) {}

  @Get('products')
  @RequirePermissions('Product.read')
  @ApiOperation({ summary: '分页查询产品' })
  findProducts(@Query() query: QueryProductDto) {
    return this.productCatalogService.findProducts(query);
  }

  @Get('products/options')
  @RequirePermissions('Product.read')
  @ApiOperation({ summary: '查询可选产品' })
  findProductOptions() {
    return this.productCatalogService.findProductOptions();
  }

  @Get('products/chat-context')
  @RequirePermissions('Product.read')
  @ApiOperation({ summary: '按问题测试产品/SKU 事实查询' })
  findSkuContextForChat(@Query('question') question = '') {
    return this.productCatalogService.findSkuContextForChat(question);
  }

  @Get('products/:id')
  @RequirePermissions('Product.read')
  @ApiOperation({ summary: '查询产品详情' })
  findProduct(@Param('id', ParseIntPipe) id: number) {
    return this.productCatalogService.findProduct(id);
  }

  @Post('products')
  @RequirePermissions('Product.create')
  @ApiOperation({ summary: '创建产品' })
  createProduct(@Body() dto: CreateProductDto) {
    return this.productCatalogService.createProduct(dto);
  }

  @Patch('products/:id')
  @RequirePermissions('Product.update')
  @ApiOperation({ summary: '更新产品' })
  updateProduct(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.productCatalogService.updateProduct(id, dto);
  }

  @Delete('products/:id')
  @RequirePermissions('Product.delete')
  @ApiOperation({ summary: '删除产品及其 SKU' })
  removeProduct(@Param('id', ParseIntPipe) id: number) {
    return this.productCatalogService.removeProduct(id);
  }

  @Post('products/batch-delete')
  @RequirePermissions('Product.batchDelete')
  @ApiOperation({ summary: '批量删除产品及其 SKU' })
  batchRemoveProducts(@Body() dto: BatchDeleteProductDto) {
    return this.productCatalogService.batchRemoveProducts(dto.ids);
  }

  @Get('product-skus')
  @RequirePermissions('ProductSku.read')
  @ApiOperation({ summary: '分页查询 SKU' })
  findSkus(@Query() query: QueryProductSkuDto) {
    return this.productCatalogService.findSkus(query);
  }

  @Get('product-skus/:id')
  @RequirePermissions('ProductSku.read')
  @ApiOperation({ summary: '查询 SKU 详情' })
  findSku(@Param('id', ParseIntPipe) id: number) {
    return this.productCatalogService.findSku(id);
  }

  @Post('product-skus')
  @RequirePermissions('ProductSku.create')
  @ApiOperation({ summary: '创建 SKU' })
  createSku(@Body() dto: CreateProductSkuDto) {
    return this.productCatalogService.createSku(dto);
  }

  @Patch('product-skus/:id')
  @RequirePermissions('ProductSku.update')
  @ApiOperation({ summary: '更新 SKU' })
  updateSku(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductSkuDto) {
    return this.productCatalogService.updateSku(id, dto);
  }

  @Delete('product-skus/:id')
  @RequirePermissions('ProductSku.delete')
  @ApiOperation({ summary: '删除 SKU' })
  removeSku(@Param('id', ParseIntPipe) id: number) {
    return this.productCatalogService.removeSku(id);
  }

  @Post('product-skus/batch-delete')
  @RequirePermissions('ProductSku.batchDelete')
  @ApiOperation({ summary: '批量删除 SKU' })
  batchRemoveSkus(@Body() dto: BatchDeleteProductSkuDto) {
    return this.productCatalogService.batchRemoveSkus(dto.ids);
  }
}
