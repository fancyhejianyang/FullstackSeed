import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductCatalogController } from './product-catalog.controller';
import { ProductCatalogService } from './product-catalog.service';
import { Product } from './entities/product.entity';
import { ProductSku } from './entities/product-sku.entity';
import { ProductExcelService } from './product-excel.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductSku])],
  controllers: [ProductCatalogController],
  providers: [ProductCatalogService, ProductExcelService],
  exports: [ProductCatalogService],
})
export class ProductCatalogModule {}
