import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedActor } from '../../types/express';
import { InitiatePaymentDto, PaymentStatusQueryDto } from './dto/payment.dto';
import { PaymentService } from './payment.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Post('checkout')
  @Public()
  @ApiOperation({ summary: 'Start an online payment and get the gateway redirect URL' })
  checkout(@CurrentUser() actor: AuthenticatedActor | undefined, @Body() dto: InitiatePaymentDto) {
    return this.payments.initiate(dto.orderNumber, dto.phone, actor);
  }

  @Get('status/:orderNumber')
  @Public()
  @ApiOperation({ summary: 'Payment status for an order (guest verified by phone)' })
  status(
    @CurrentUser() actor: AuthenticatedActor | undefined,
    @Param('orderNumber') orderNumber: string,
    @Query() query: PaymentStatusQueryDto,
  ) {
    return this.payments.status(orderNumber, query.phone, actor);
  }

  @Post('bkash/callback')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'bKash server callback (execute + settle)' })
  bkashCallback(@Body() payload: Record<string, unknown>) {
    return this.payments.handleBkashCallback(payload);
  }

  @Post('sslcommerz/ipn')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'SSLCommerz IPN (validate + settle)' })
  sslcommerzIpn(@Body() payload: Record<string, unknown>) {
    return this.payments.handleSslcommerzCallback(payload);
  }

  @Post('sslcommerz/success')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'SSLCommerz success redirect' })
  sslcommerzSuccess(@Body() payload: Record<string, unknown>) {
    return this.payments.handleSslcommerzCallback(payload);
  }

  @Post('sslcommerz/fail')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'SSLCommerz failure redirect' })
  sslcommerzFail(@Body() payload: Record<string, unknown>) {
    return this.payments.handleSslcommerzCallback(payload);
  }

  @Post('sslcommerz/cancel')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'SSLCommerz cancel redirect' })
  sslcommerzCancel(@Body() payload: Record<string, unknown>) {
    return this.payments.handleSslcommerzCallback(payload);
  }
}
