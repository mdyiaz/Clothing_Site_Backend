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
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/auth.decorators';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/permissions';
import { CreateNavbarItemDto, ReorderNavbarDto, UpdateNavbarItemDto } from './dto/navbar.dto';
import { NavbarService } from './navbar.service';

const MANAGE = PERMISSIONS.CONTENT_MANAGE;

@ApiTags('Navbar')
@Controller('navbar')
export class NavbarController {
  constructor(private readonly navbar: NavbarService) {}

  // ── storefront (public) ────────────────────────────────────────────────────

  @Get()
  @Public()
  @ApiOperation({ summary: 'Active nav tree with resolved URLs (2 levels)' })
  storefront() {
    return this.navbar.getStorefront();
  }

  // ── admin ─────────────────────────────────────────────────────────────────

  @Get('admin')
  @RequirePermissions(MANAGE)
  @ApiOperation({ summary: 'All nav items, flat (includes inactive)' })
  listAdmin() {
    return this.navbar.getAdmin();
  }

  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  @ApiOperation({ summary: 'Drag-and-drop save: ids in their new left-to-right order' })
  reorder(@Body() dto: ReorderNavbarDto) {
    return this.navbar.reorder(dto.itemIds);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(MANAGE)
  create(@Body() dto: CreateNavbarItemDto) {
    return this.navbar.create(dto);
  }

  @Get(':id')
  @RequirePermissions(MANAGE)
  getOne(@Param('id') id: string) {
    return this.navbar.findById(id);
  }

  @Patch(':id')
  @RequirePermissions(MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateNavbarItemDto) {
    return this.navbar.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  remove(@Param('id') id: string) {
    return this.navbar.remove(id);
  }
}
