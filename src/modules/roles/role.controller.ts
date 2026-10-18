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
import { Role } from '@prisma/client';
import { BaseController } from '../../common/base/base.controller';
import { CursorPaginationDto, PaginationDto } from '../../common/dto/pagination.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ACTION_PERMISSIONS, MENU_PERMISSIONS, PERMISSIONS } from '../../common/permissions';
import { AssignRoleDto, CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { RoleService } from './role.service';

@ApiTags('Roles')
@Controller('roles')
export class RoleController extends BaseController<Role, CreateRoleDto, UpdateRoleDto> {
  declare protected readonly service: RoleService;

  constructor(service: RoleService) {
    super(service);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.ROLE_READ)
  override findAll(@Query() query: PaginationDto) {
    return super.findAll(query);
  }

  @Get('permissions')
  @RequirePermissions(PERMISSIONS.ROLE_READ)
  @ApiOperation({ summary: 'Permission catalog for the role editor checkbox tree' })
  getPermissionCatalog() {
    return {
      menus: MENU_PERMISSIONS,
      actions: Object.values(ACTION_PERMISSIONS),
      wildcard: '*',
    };
  }

  @Get('cursor')
  @RequirePermissions(PERMISSIONS.ROLE_READ)
  override findCursor(@Query() query: CursorPaginationDto) {
    return super.findCursor(query);
  }

  @Post('assign')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  @ApiOperation({ summary: 'Assign a role to a user (revokes their sessions)' })
  assign(@Body() dto: AssignRoleDto) {
    return this.service.assign(dto);
  }

  @Post('unassign')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  @ApiOperation({ summary: 'Remove a role from a user (revokes their sessions)' })
  unassign(@Body() dto: AssignRoleDto) {
    return this.service.unassign(dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ROLE_READ)
  override findOne(@Param('id') id: string) {
    return super.findOne(id);
  }

  @Get(':id/users')
  @RequirePermissions(PERMISSIONS.ROLE_READ)
  @ApiOperation({ summary: 'Users holding this role' })
  users(@Param('id') id: string) {
    return this.service.users(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  override create(@Body() dto: CreateRoleDto) {
    return super.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  override update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return super.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  override remove(@Param('id') id: string) {
    return super.remove(id);
  }
}
