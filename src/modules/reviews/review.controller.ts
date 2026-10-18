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
import { CreateReviewDto, ModerateReviewDto, QueryReviewDto } from './dto/review.dto';
import { ReviewService } from './review.service';

const MANAGE = PERMISSIONS.SUPPORT_MANAGE_REVIEWS;

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviews: ReviewService) {}

  // ── storefront (public) ────────────────────────────────────────────────────

  @Get()
  @Public()
  @ApiOperation({ summary: 'Approved reviews for a product (requires ?productId=)' })
  list(@Query() query: QueryReviewDto) {
    return this.reviews.listForProduct(query.productId ?? '', query);
  }

  @Get('summary')
  @Public()
  @ApiOperation({ summary: 'Rating average, total and distribution for a product' })
  summary(@Query('productId') productId: string) {
    return this.reviews.summary(productId);
  }

  // ── customer (auth) ────────────────────────────────────────────────────────

  @Get('mine')
  @ApiOperation({ summary: 'Reviews written by the signed-in customer' })
  listMine(@CurrentUser() actor: AuthenticatedActor, @Query() query: QueryReviewDto) {
    return this.reviews.listMine(actor.userId, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Write a review (verified when the order was delivered)' })
  create(@CurrentUser() actor: AuthenticatedActor, @Body() dto: CreateReviewDto) {
    return this.reviews.createForUser(actor.userId, dto);
  }

  @Delete('mine/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete one of your own reviews' })
  removeMine(@CurrentUser() actor: AuthenticatedActor, @Param('id') id: string) {
    return this.reviews.removeMine(actor.userId, id);
  }

  // ── admin ──────────────────────────────────────────────────────────────────

  @Get('admin')
  @RequirePermissions(MANAGE)
  @ApiOperation({ summary: 'All reviews incl. pending (filters: productId, rating, isApproved)' })
  listAdmin(@Query() query: QueryReviewDto) {
    return this.reviews.findAll(query);
  }

  @Patch(':id/approve')
  @RequirePermissions(MANAGE)
  @ApiOperation({ summary: 'Approve or hide a review' })
  moderate(@Param('id') id: string, @Body() dto: ModerateReviewDto) {
    return this.reviews.setApproval(id, dto.isApproved);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(MANAGE)
  remove(@Param('id') id: string) {
    return this.reviews.remove(id);
  }
}
