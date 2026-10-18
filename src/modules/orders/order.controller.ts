import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/auth.decorators';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/permissions';
import { AuthenticatedActor } from '../../types/express';
import { CheckoutDto, QueryOrderDto, TrackOrderDto, UpdateOrderStatusDto, UpdatePaymentDto } from './dto/order.dto';
import { OrderService } from './order.service';

@ApiTags('Orders')
@Controller('orders')
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  @Public()
  @ApiOperation({ summary: 'Place an order from the cart (guest or signed-in)' })
  checkout(@CurrentUser() actor: AuthenticatedActor | undefined, @Body() dto: CheckoutDto) {
    return this.orders.checkout(actor, dto);
  }

  @Get('track')
  @Public()
  @ApiOperation({ summary: 'Track an order by number (+ phone for guest orders)' })
  track(@CurrentUser() actor: AuthenticatedActor | undefined, @Query() query: TrackOrderDto) {
    return this.orders.track(query.orderNumber, query.phone, actor);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Signed-in customer order history' })
  myOrders(@CurrentUser() actor: AuthenticatedActor, @Query() query: QueryOrderDto) {
    return this.orders.myOrders(actor.userId, query);
  }

  @Get('mine/:id')
  @ApiOperation({ summary: 'One of my orders with items + timeline' })
  myOrder(@CurrentUser() actor: AuthenticatedActor, @Param('id') id: string) {
    return this.orders.myOrderDetail(actor.userId, id);
  }

  @Patch('mine/:id/cancel')
  @ApiOperation({ summary: 'Cancel my order while it is still PENDING/CONFIRMED' })
  cancelMine(@CurrentUser() actor: AuthenticatedActor, @Param('id') id: string) {
    return this.orders.cancelMine(actor.userId, id);
  }

  @Get('admin')
  @RequirePermissions(PERMISSIONS.ORDER_READ)
  @ApiOperation({ summary: 'Every order with filters (admin)' })
  adminList(@Query() query: QueryOrderDto) {
    return this.orders.findAll(query);
  }

  @Get('admin/:id')
  @RequirePermissions(PERMISSIONS.ORDER_READ)
  @ApiOperation({ summary: 'Order detail with items, payments, timeline (admin)' })
  adminDetail(@Param('id') id: string) {
    return this.orders.adminDetail(id);
  }

  @Patch('admin/:id/status')
  @RequirePermissions(PERMISSIONS.ORDER_UPDATE_STATUS)
  @ApiOperation({ summary: 'Move an order along the status pipeline' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    return this.orders.updateStatus(id, dto.status as OrderStatus, actor.userId, dto.note);
  }

  @Patch('admin/:id/cancel')
  @RequirePermissions(PERMISSIONS.ORDER_CANCEL)
  @ApiOperation({ summary: 'Cancel an order and return its stock (admin)' })
  cancel(@Param('id') id: string, @CurrentUser() actor: AuthenticatedActor) {
    return this.orders.updateStatus(id, OrderStatus.CANCELLED, actor.userId, 'Cancelled by admin');
  }

  @Patch('admin/:id/payment')
  @RequirePermissions(PERMISSIONS.ORDER_UPDATE_STATUS)
  @ApiOperation({ summary: 'Record payment status / COD collection (admin)' })
  updatePayment(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentDto,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    return this.orders.updatePayment(
      id,
      dto.paymentStatus as PaymentStatus | undefined,
      dto.codCollected,
      actor.userId,
    );
  }
}
