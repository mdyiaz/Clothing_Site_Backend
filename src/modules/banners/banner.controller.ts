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
import { Public } from '../../common/decorators/auth.decorators';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PERMISSIONS } from '../../common/permissions';
import { BannerService } from './banner.service';
import { BannerQueryDto, CreateBannerDto, UpdateBannerDto } from './dto/banner.dto';

const MANAGE = PERMISSIONS.MARKETING_MANAGE_BANNERS;

@ApiTags('Banners')
@Controller('banners')
export class BannerController {
  constructor(private readonly banners: BannerService) {}

  // ── storefront (public) ────────────────────────────────────────────────────

  @Get()
  @Public()
  @ApiOperation({ summary: 'Live banners, optionally filtered by ?position=' })
  listLive(@Query() query: BannerQueryDto) {
    return this.banners.findLive(query.position);
  }

  // ── admin ─────────────────────────────────────────────────────────────────

  @Get('admin')
  @RequirePermissions(MANAGE)
  @ApiOperation({ summary: 'Admin banner list (includes inactive)' })
  listAdmin(@Query() query: PaginationDto) {
    return this.banners.findAll(query);
  }

  @Get('admin/:id')
  @RequirePermissions(MANAGE)
  getAdmin(@Param('id') id: string) {
    return this.banners.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(MANAGE)
  create(@Body() dto: CreateBannerDto) {
    return this.banners.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateBannerDto) {
    return this.banners.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  remove(@Param('id') id: string) {
    return this.banners.remove(id);
  }
}
