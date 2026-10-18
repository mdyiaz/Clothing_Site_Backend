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
import {
  CreateContactInfoDto,
  CreateFooterColumnDto,
  CreateFooterLinkDto,
  CreateSocialLinkDto,
  SubscribeNewsletterDto,
  UpdateContactInfoDto,
  UpdateFooterColumnDto,
  UpdateFooterLinkDto,
  UpdateSocialLinkDto,
} from './dto/footer.dto';
import { FooterService } from './footer.service';

const MANAGE = PERMISSIONS.CONTENT_MANAGE;

@ApiTags('Footer')
@Controller('footer')
export class FooterController {
  constructor(private readonly footer: FooterService) {}

  // ── storefront (public) ────────────────────────────────────────────────────

  @Get()
  @Public()
  @ApiOperation({ summary: 'Live footer: columns + links, contact strip, social icons' })
  storefront() {
    return this.footer.getStorefront();
  }

  @Post('newsletter')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({ summary: 'Newsletter signup (email and/or phone)' })
  subscribe(@Body() dto: SubscribeNewsletterDto) {
    return this.footer.subscribe(dto);
  }

  // ── admin: full payload + subscribers ─────────────────────────────────────

  @Get('admin')
  @RequirePermissions(MANAGE)
  @ApiOperation({ summary: 'All footer content (includes inactive)' })
  admin() {
    return this.footer.getAdmin();
  }

  @Get('newsletter')
  @RequirePermissions(MANAGE)
  @ApiOperation({ summary: 'Newsletter subscribers (paginated)' })
  listSubscribers(@Query() query: PaginationDto) {
    return this.footer.listSubscribers(query);
  }

  // ── admin: columns ────────────────────────────────────────────────────────

  @Post('columns')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(MANAGE)
  createColumn(@Body() dto: CreateFooterColumnDto) {
    return this.footer.createColumn(dto);
  }

  @Patch('columns/:id')
  @RequirePermissions(MANAGE)
  updateColumn(@Param('id') id: string, @Body() dto: UpdateFooterColumnDto) {
    return this.footer.updateColumn(id, dto);
  }

  @Delete('columns/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  deleteColumn(@Param('id') id: string) {
    return this.footer.deleteColumn(id);
  }

  // ── admin: links ──────────────────────────────────────────────────────────

  @Post('columns/:columnId/links')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(MANAGE)
  createLink(@Param('columnId') columnId: string, @Body() dto: CreateFooterLinkDto) {
    return this.footer.createLink(columnId, dto);
  }

  @Patch('links/:id')
  @RequirePermissions(MANAGE)
  updateLink(@Param('id') id: string, @Body() dto: UpdateFooterLinkDto) {
    return this.footer.updateLink(id, dto);
  }

  @Delete('links/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  deleteLink(@Param('id') id: string) {
    return this.footer.deleteLink(id);
  }

  // ── admin: contact strip ──────────────────────────────────────────────────

  @Post('contact')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(MANAGE)
  createContact(@Body() dto: CreateContactInfoDto) {
    return this.footer.createContact(dto);
  }

  @Patch('contact/:id')
  @RequirePermissions(MANAGE)
  updateContact(@Param('id') id: string, @Body() dto: UpdateContactInfoDto) {
    return this.footer.updateContact(id, dto);
  }

  @Delete('contact/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  deleteContact(@Param('id') id: string) {
    return this.footer.deleteContact(id);
  }

  // ── admin: social icons ───────────────────────────────────────────────────

  @Post('social')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(MANAGE)
  createSocial(@Body() dto: CreateSocialLinkDto) {
    return this.footer.createSocial(dto);
  }

  @Patch('social/:id')
  @RequirePermissions(MANAGE)
  updateSocial(@Param('id') id: string, @Body() dto: UpdateSocialLinkDto) {
    return this.footer.updateSocial(id, dto);
  }

  @Delete('social/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  deleteSocial(@Param('id') id: string) {
    return this.footer.deleteSocial(id);
  }
}
