import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedActor } from '../../types/express';
import { MoveToCartDto, ToggleWishlistDto } from './dto/wishlist.dto';
import { WishlistService } from './wishlist.service';

@ApiTags('Wishlist')
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  @ApiOperation({ summary: 'Signed-in user wishlist with product snapshots' })
  list(@CurrentUser() actor: AuthenticatedActor) {
    return this.wishlist.list(actor.userId);
  }

  @Post('toggle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Heart button: adds when absent, removes when present' })
  toggle(@CurrentUser() actor: AuthenticatedActor, @Body() dto: ToggleWishlistDto) {
    return this.wishlist.toggle(actor.userId, dto.productId, dto.variantId);
  }

  @Delete(':itemId')
  @ApiOperation({ summary: 'Remove one saved line' })
  remove(@CurrentUser() actor: AuthenticatedActor, @Param('itemId') itemId: string) {
    return this.wishlist.remove(actor.userId, itemId);
  }

  @Post(':itemId/move-to-cart')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move a saved line into the cart' })
  moveToCart(
    @CurrentUser() actor: AuthenticatedActor,
    @Param('itemId') itemId: string,
    @Body() dto: MoveToCartDto,
  ) {
    return this.wishlist.moveToCart(actor.userId, itemId, dto.quantity ?? 1);
  }
}
