import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/auth.decorators';
import { AuthenticatedActor } from '../../types/express';
import { CartService } from './cart.service';
import { AddToCartDto, CartIdentityDto, MergeCartDto, UpdateCartItemDto } from './dto/cart.dto';

@ApiTags('Cart')
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Current cart with totals (guest via ?sessionId, user via token)' })
  getCart(@CurrentUser() actor: AuthenticatedActor | undefined, @Query() query: CartIdentityDto) {
    return this.cart.getCart(this.cart.resolveIdentity(actor, query.sessionId));
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({ summary: 'Add a line (merges with an identical existing line)' })
  addItem(@CurrentUser() actor: AuthenticatedActor | undefined, @Body() dto: AddToCartDto) {
    return this.cart.addItem(this.cart.resolveIdentity(actor, dto.sessionId), dto);
  }

  @Patch('items/:itemId')
  @Public()
  @ApiOperation({ summary: 'Set a line quantity (0 removes the line)' })
  updateItem(
    @Param('itemId') itemId: string,
    @CurrentUser() actor: AuthenticatedActor | undefined,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cart.updateItem(this.cart.resolveIdentity(actor, dto.sessionId), itemId, dto.quantity);
  }

  @Delete('items/:itemId')
  @Public()
  @ApiOperation({ summary: 'Remove one line' })
  removeItem(
    @Param('itemId') itemId: string,
    @CurrentUser() actor: AuthenticatedActor | undefined,
    @Query() query: CartIdentityDto,
  ) {
    return this.cart.removeItem(this.cart.resolveIdentity(actor, query.sessionId), itemId);
  }

  @Delete()
  @Public()
  @ApiOperation({ summary: 'Empty the cart' })
  clear(@CurrentUser() actor: AuthenticatedActor | undefined, @Query() query: CartIdentityDto) {
    return this.cart.clear(this.cart.resolveIdentity(actor, query.sessionId));
  }

  @Post('merge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fold a guest cart into the signed-in user cart (after login)' })
  merge(@CurrentUser() actor: AuthenticatedActor, @Body() dto: MergeCartDto) {
    return this.cart.merge(dto.sessionId, actor.userId);
  }
}
