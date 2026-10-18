import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/permissions';
import { AuthenticatedActor } from '../../types/express';
import { CreateVoucherDto, QueryVoucherDto, UpdateVoucherDto, ValidateVoucherDto } from './dto/voucher.dto';
import { VoucherService } from './voucher.service';

@ApiTags('Gift Vouchers')
@Controller('vouchers')
export class VoucherController {
  constructor(private readonly vouchers: VoucherService) {}

  @Post('validate')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview a gift voucher (balance + applicable amount)' })
  validate(@Body() dto: ValidateVoucherDto) {
    return this.vouchers.preview(dto.code, dto.amount);
  }

  @Get('admin')
  @RequirePermissions(PERMISSIONS.VOUCHER_READ)
  @ApiOperation({ summary: 'Admin: paginated voucher list' })
  list(@Query() query: QueryVoucherDto) {
    return this.vouchers.list(query);
  }

  @Get('admin/:id')
  @RequirePermissions(PERMISSIONS.VOUCHER_READ)
  @ApiOperation({ summary: 'Admin: voucher detail' })
  detail(@Param('id') id: string) {
    return this.vouchers.get(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.VOUCHER_MANAGE)
  @ApiOperation({ summary: 'Admin: issue a voucher' })
  create(@Body() dto: CreateVoucherDto, @CurrentUser() actor: AuthenticatedActor) {
    return this.vouchers.create(dto, actor.userId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.VOUCHER_MANAGE)
  @ApiOperation({ summary: 'Admin: update a voucher' })
  update(@Param('id') id: string, @Body() dto: UpdateVoucherDto) {
    return this.vouchers.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.VOUCHER_MANAGE)
  @ApiOperation({ summary: 'Admin: cancel a voucher' })
  cancel(@Param('id') id: string) {
    return this.vouchers.cancel(id);
  }
}
