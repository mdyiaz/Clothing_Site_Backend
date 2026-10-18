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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/permissions';
import { AuthenticatedActor } from '../../types/express';
import { AddressService } from './address.service';
import {
  AdminUpdateUserDto,
  CreateAddressDto,
  QueryUserDto,
  UpdateAddressDto,
  UpdateProfileDto,
} from './dto/user.dto';
import { UserService } from './user.service';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(
    private readonly users: UserService,
    private readonly addresses: AddressService,
  ) {}

  // ── customer profile (auth) ────────────────────────────────────────────────

  @Get('me')
  @ApiOperation({ summary: 'Current customer profile' })
  getMe(@CurrentUser() actor: AuthenticatedActor) {
    return this.users.getProfile(actor.userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the current customer profile' })
  updateMe(@CurrentUser() actor: AuthenticatedActor, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(actor.userId, dto);
  }

  // ── customer addresses (auth) ──────────────────────────────────────────────

  @Get('me/addresses')
  @ApiOperation({ summary: 'List the customer addresses' })
  listAddresses(@CurrentUser() actor: AuthenticatedActor) {
    return this.addresses.list(actor.userId);
  }

  @Post('me/addresses')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add an address (first one becomes default)' })
  createAddress(@CurrentUser() actor: AuthenticatedActor, @Body() dto: CreateAddressDto) {
    return this.addresses.create(actor.userId, dto);
  }

  @Patch('me/addresses/:id')
  @ApiOperation({ summary: 'Update one of the customer addresses' })
  updateAddress(
    @CurrentUser() actor: AuthenticatedActor,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addresses.update(actor.userId, id, dto);
  }

  @Patch('me/addresses/:id/default')
  @ApiOperation({ summary: 'Make an address the default' })
  setDefaultAddress(@CurrentUser() actor: AuthenticatedActor, @Param('id') id: string) {
    return this.addresses.setDefault(actor.userId, id);
  }

  @Delete('me/addresses/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete one of the customer addresses' })
  removeAddress(@CurrentUser() actor: AuthenticatedActor, @Param('id') id: string) {
    return this.addresses.remove(actor.userId, id);
  }

  // ── admin ──────────────────────────────────────────────────────────────────

  @Get('admin')
  @RequirePermissions(PERMISSIONS.USER_READ)
  @ApiOperation({ summary: 'Admin user list (search, isActive, roleSlug)' })
  listAdmin(@Query() query: QueryUserDto) {
    return this.users.findAll(query);
  }

  @Get('admin/:id')
  @RequirePermissions(PERMISSIONS.USER_READ)
  @ApiOperation({ summary: 'Admin user detail with roles' })
  detailAdmin(@Param('id') id: string) {
    return this.users.findById(id);
  }

  @Patch('admin/:id')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: 'Update a user (activate/deactivate, contact, loyalty)' })
  updateAdmin(@Param('id') id: string, @Body() dto: AdminUpdateUserDto) {
    return this.users.adminUpdate(id, dto);
  }

  @Delete('admin/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: 'Soft-delete a user' })
  removeAdmin(@Param('id') id: string) {
    return this.users.remove(id);
  }
}
