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
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/auth.decorators';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PERMISSIONS } from '../../common/permissions';
import { CollectionService } from './collection.service';
import { CreateCollectionDto, ManageCollectionProductsDto, UpdateCollectionDto } from './dto/collection.dto';

const MANAGE = PERMISSIONS.MARKETING_MANAGE_COLLECTIONS;

@ApiTags('Collections')
@Controller('collections')
export class CollectionController {
  constructor(private readonly collections: CollectionService) {}

  // ── storefront (public) ────────────────────────────────────────────────────

  @Get()
  @Public()
  @ApiOperation({ summary: 'Collections live right now (navbar / landing pages)' })
  listLive() {
    return this.collections.findLive();
  }

  // ── admin (declared before GET :slug so `/collections/admin` never 404s) ──

  @Get('admin')
  @RequirePermissions(MANAGE)
  @ApiOperation({ summary: 'Admin collection list (includes inactive)' })
  listAdmin(@Query() query: PaginationDto) {
    return this.collections.findAll(query);
  }

  @Get('admin/:id')
  @RequirePermissions(MANAGE)
  @ApiOperation({ summary: 'Admin collection detail with hand-picked products' })
  detailAdmin(@Param('id') id: string) {
    return this.collections.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(MANAGE)
  create(@Body() dto: CreateCollectionDto) {
    return this.collections.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateCollectionDto) {
    return this.collections.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  remove(@Param('id') id: string) {
    return this.collections.remove(id);
  }

  // ── collection ↔ products ─────────────────────────────────────────────────

  @Put(':id/products')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  @ApiOperation({ summary: 'Replace the product set of a collection' })
  replaceProducts(@Param('id') id: string, @Body() dto: ManageCollectionProductsDto) {
    return this.collections.setProducts(id, dto.productIds, 'replace');
  }

  @Post(':id/products')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  @ApiOperation({ summary: 'Add products to a collection' })
  addProducts(@Param('id') id: string, @Body() dto: ManageCollectionProductsDto) {
    return this.collections.setProducts(id, dto.productIds, 'add');
  }

  @Delete(':id/products')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  @ApiOperation({ summary: 'Remove products from a collection' })
  removeProducts(@Param('id') id: string, @Body() dto: ManageCollectionProductsDto) {
    return this.collections.setProducts(id, dto.productIds, 'remove');
  }

  // ── storefront detail (declared last: matches any slug) ───────────────────

  @Get(':slug')
  @Public()
  @ApiOperation({ summary: 'Collection detail by slug with resolved products' })
  liveBySlug(@Param('slug') slug: string) {
    return this.collections.findLiveBySlug(slug);
  }
}
