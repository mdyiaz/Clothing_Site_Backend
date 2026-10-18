import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Category } from '@prisma/client';
import { BaseController } from '../../common/base/base.controller';
import { CursorPaginationDto, PaginationDto } from '../../common/dto/pagination.dto';
import { Public } from '../../common/decorators/auth.decorators';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/permissions';
import { CategoryService } from './category.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@ApiTags('Categories')
@Controller('categories')
export class CategoryController extends BaseController<Category, CreateCategoryDto, UpdateCategoryDto> {
  declare protected readonly service: CategoryService;

  constructor(service: CategoryService) {
    super(service);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.CATEGORY_READ)
  override findAll(@Query() query: PaginationDto) {
    return super.findAll(query);
  }

  @Get('cursor')
  @RequirePermissions(PERMISSIONS.CATEGORY_READ)
  override findCursor(@Query() query: CursorPaginationDto) {
    return super.findCursor(query);
  }

  // ── storefront (public) ────────────────────────────────────────────────────

  @Get('storefront')
  @Public()
  @ApiOperation({ summary: 'Active category tree for the nav / mega menu (2 levels shown)' })
  storefront() {
    return this.service.getTree(false);
  }

  @Get('storefront/:slug')
  @Public()
  @ApiOperation({ summary: 'Active category by slug (/c/:slug)' })
  storefrontBySlug(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }

  // ── admin ─────────────────────────────────────────────────────────────────

  @Get('tree')
  @RequirePermissions(PERMISSIONS.CATEGORY_READ)
  @ApiOperation({ summary: 'Nested category tree (admin builder / mega menu)' })
  @ApiQuery({ name: 'includeInactive', required: false })
  getTree(@Query('includeInactive') includeInactive?: string) {
    return this.service.getTree(includeInactive === 'true');
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CATEGORY_READ)
  override findOne(@Param('id') id: string) {
    return super.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.CATEGORY_CREATE)
  override create(@Body() dto: CreateCategoryDto) {
    return super.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CATEGORY_UPDATE)
  override update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return super.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.CATEGORY_DELETE)
  override remove(@Param('id') id: string) {
    return super.remove(id);
  }
}
