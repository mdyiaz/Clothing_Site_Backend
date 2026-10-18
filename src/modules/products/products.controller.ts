import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Product } from '@prisma/client';
import { Public } from '../../common/decorators/auth.decorators';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/permissions';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { ProductsFacetsService } from './products-facets.service';
import { ProductsService } from './products.service';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly facets: ProductsFacetsService,
  ) {}

  // ── storefront (public) ────────────────────────────────────────────────────

  @Get()
  @Public()
  @ApiOperation({ summary: 'Catalogue listing with filters, search and sort' })
  list(@Query() query: QueryProductDto) {
    return this.products.findAll(query);
  }

  @Get('cursor')
  @Public()
  @ApiOperation({ summary: 'Cursor listing for infinite scroll (storefront)' })
  cursor(@Query() query: QueryProductDto) {
    return this.products.findAllCursor(query);
  }

  @Get('filters/facets')
  @Public()
  @ApiOperation({ summary: 'Counts for every filter option matching the query' })
  getFacets(@Query() query: QueryProductDto) {
    return this.facets.getFacets(query);
  }

  // ── admin ─────────────────────────────────────────────────────────────────

  @Get('admin')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({ summary: 'Admin catalogue (includes inactive products)' })
  listAdmin(@Query() query: QueryProductDto) {
    return this.products.findAllAdmin(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PRODUCT_CREATE)
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.PRODUCT_DELETE)
  remove(@Param('id') id: string) {
    return this.products.remove(id);
  }

  // ── detail (public) ───────────────────────────────────────────────────────

  @Get(':slug')
  @Public()
  @ApiOperation({ summary: 'Product detail by slug' })
  detail(@Param('slug') slug: string): Promise<Product> {
    return this.products.findBySlug(slug);
  }
}
