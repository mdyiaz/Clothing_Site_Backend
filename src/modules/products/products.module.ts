import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { ProductsController } from './products.controller';
import { ProductsFacetsService } from './products-facets.service';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

@Module({
  imports: [CacheModule],
  controllers: [ProductsController],
  providers: [ProductsRepository, ProductsService, ProductsFacetsService],
  exports: [ProductsService],
})
export class ProductsModule {}
