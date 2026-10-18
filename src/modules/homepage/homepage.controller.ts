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
import { PERMISSIONS } from '../../common/permissions';
import {
  CreateSectionDto,
  CreateSectionMediaDto,
  ReorderSectionsDto,
  SetSectionItemsDto,
  UpdateSectionDto,
  UpdateSectionMediaDto,
} from './dto/homepage.dto';
import { HomepageService } from './homepage.service';

const MANAGE = PERMISSIONS.MARKETING_MANAGE_HOMEPAGE;

@ApiTags('Homepage Builder')
@Controller('homepage')
export class HomepageController {
  constructor(private readonly homepage: HomepageService) {}

  // ── storefront (public) ────────────────────────────────────────────────────

  @Get()
  @Public()
  @ApiOperation({ summary: 'Live homepage sections, resolved, in display order' })
  storefront(@Query('pageKey') pageKey?: string) {
    return this.homepage.getStorefront(pageKey ?? 'home');
  }

  // ── admin: sections ───────────────────────────────────────────────────────

  @Get('admin')
  @RequirePermissions(MANAGE)
  @ApiOperation({ summary: 'All sections for a page (includes inactive)' })
  adminList(@Query('pageKey') pageKey?: string) {
    return this.homepage.getAdmin(pageKey ?? 'home');
  }

  @Post('sections')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(MANAGE)
  createSection(@Body() dto: CreateSectionDto) {
    return this.homepage.create(dto);
  }

  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  @ApiOperation({ summary: 'Drag-and-drop save: ids in their new top-to-bottom order' })
  reorder(@Body() dto: ReorderSectionsDto) {
    return this.homepage.reorder(dto.sectionIds);
  }

  @Get('sections/:id')
  @RequirePermissions(MANAGE)
  getSection(@Param('id') id: string) {
    return this.homepage.findById(id);
  }

  @Patch('sections/:id')
  @RequirePermissions(MANAGE)
  updateSection(@Param('id') id: string, @Body() dto: UpdateSectionDto) {
    return this.homepage.update(id, dto);
  }

  @Delete('sections/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  removeSection(@Param('id') id: string) {
    return this.homepage.remove(id);
  }

  // ── admin: section content ────────────────────────────────────────────────

  @Put('sections/:id/items')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  @ApiOperation({ summary: 'Replace the hand-picked products of a MANUAL section' })
  setItems(@Param('id') id: string, @Body() dto: SetSectionItemsDto) {
    return this.homepage.setItems(id, dto.productIds);
  }

  @Post('sections/:id/media')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(MANAGE)
  addMedia(@Param('id') id: string, @Body() dto: CreateSectionMediaDto) {
    return this.homepage.addMedia(id, dto);
  }

  @Patch('sections/:id/media/:mediaId')
  @RequirePermissions(MANAGE)
  updateMedia(
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
    @Body() dto: UpdateSectionMediaDto,
  ) {
    return this.homepage.updateMedia(id, mediaId, dto);
  }

  @Delete('sections/:id/media/:mediaId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  removeMedia(@Param('id') id: string, @Param('mediaId') mediaId: string) {
    return this.homepage.removeMedia(id, mediaId);
  }
}
