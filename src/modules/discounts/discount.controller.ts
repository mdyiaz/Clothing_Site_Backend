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
import { Public } from '../../common/decorators/auth.decorators';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/permissions';
import { AuthenticatedActor } from '../../types/express';
import { CartService } from '../cart/cart.service';
import { DiscountService, DiscountLine } from './discount.service';
import {
  ApplyCouponDto,
  CreateCouponDto,
  CreateDiscountDto,
  QueryDiscountDto,
  UpdateCouponDto,
  UpdateDiscountDto,
} from './dto/discount.dto';

const MANAGE = PERMISSIONS.MARKETING_MANAGE_COUPONS;

@ApiTags('Discounts & Coupons')
@Controller('discounts')
export class DiscountController {
  constructor(
    private readonly discounts: DiscountService,
    private readonly cart: CartService,
  ) {}

  // ── storefront (public) ────────────────────────────────────────────────────

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({ summary: 'Preview a coupon against the current cart' })
  async validate(
    @CurrentUser() actor: AuthenticatedActor | undefined,
    @Body() dto: ApplyCouponDto,
  ) {
    const cart = await this.cart.getCart(this.cart.resolveIdentity(actor, dto.sessionId));
    const lines: DiscountLine[] = cart.items.map((item) => ({
      productId: item.productId,
      price: item.price,
      quantity: item.quantity,
      total: item.lineTotal,
    }));
    const userId = actor && !actor.isGuest ? actor.userId : undefined;

    return this.discounts.validate(dto.code, {
      userId,
      lines,
      subtotal: cart.subtotal,
      shippingAmount: 0,
    });
  }

  // ── admin (declared before any `:id` route) ────────────────────────────────

  @Get('admin')
  @RequirePermissions(MANAGE)
  @ApiOperation({ summary: 'Admin discount list (filters: scope, type, isActive)' })
  listAdmin(@Query() query: QueryDiscountDto) {
    return this.discounts.findAll(query);
  }

  @Get('admin/:id')
  @RequirePermissions(MANAGE)
  @ApiOperation({ summary: 'Admin discount detail with its coupons' })
  detailAdmin(@Param('id') id: string) {
    return this.discounts.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(MANAGE)
  create(@Body() dto: CreateDiscountDto) {
    return this.discounts.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateDiscountDto) {
    return this.discounts.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  remove(@Param('id') id: string) {
    return this.discounts.remove(id);
  }

  // ── coupons ────────────────────────────────────────────────────────────────

  @Get(':id/coupons')
  @RequirePermissions(MANAGE)
  @ApiOperation({ summary: 'Coupons belonging to a discount' })
  listCoupons(@Param('id') id: string) {
    return this.discounts.listCoupons(id);
  }

  @Post(':id/coupons')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(MANAGE)
  createCoupon(@Param('id') id: string, @Body() dto: CreateCouponDto) {
    return this.discounts.createCoupon(id, dto);
  }

  @Patch('coupons/:couponId')
  @RequirePermissions(MANAGE)
  updateCoupon(@Param('couponId') couponId: string, @Body() dto: UpdateCouponDto) {
    return this.discounts.updateCoupon(couponId, dto);
  }

  @Delete('coupons/:couponId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  removeCoupon(@Param('couponId') couponId: string) {
    return this.discounts.removeCoupon(couponId);
  }
}
