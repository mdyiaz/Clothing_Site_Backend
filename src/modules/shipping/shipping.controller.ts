import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/permissions';
import { AuthenticatedActor } from '../../types/express';
import { ShippingService } from './shipping.service';

@ApiTags('Shipping (3PL)')
@Controller('shipments')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Post('orders/:orderId')
  @RequirePermissions(PERMISSIONS.DELIVERY_MANAGE_3PL)
  @ApiOperation({ summary: 'Create a parcel with the configured courier' })
  create(@Param('orderId') orderId: string, @CurrentUser() actor: AuthenticatedActor) {
    return this.shipping.createShipment(orderId, actor.userId);
  }

  @Get('orders/:orderId/track')
  @RequirePermissions(PERMISSIONS.DELIVERY_MANAGE_3PL)
  @ApiOperation({ summary: 'Live courier tracking status' })
  track(@Param('orderId') orderId: string) {
    return this.shipping.track(orderId);
  }

  @Post('orders/:orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.DELIVERY_MANAGE_3PL)
  @ApiOperation({ summary: 'Cancel the parcel with the courier' })
  cancel(@Param('orderId') orderId: string, @CurrentUser() actor: AuthenticatedActor) {
    return this.shipping.cancelShipment(orderId, actor.userId);
  }
}
