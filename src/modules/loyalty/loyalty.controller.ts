import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/permissions';
import { AuthenticatedActor } from '../../types/express';
import { AdjustPointsDto, QueryLoyaltyDto, RedeemPointsDto } from './dto/loyalty.dto';
import { LoyaltyService } from './loyalty.service';

@ApiTags('Loyalty')
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('me')
  @ApiOperation({ summary: 'Current customer loyalty summary + recent activity' })
  async mine(@CurrentUser() actor: AuthenticatedActor) {
    const [summary, history] = await Promise.all([
      this.loyalty.getSummary(actor.userId),
      this.loyalty.history(actor.userId, 10, 0),
    ]);
    return { ...summary, history };
  }

  @Get('me/history')
  @ApiOperation({ summary: 'Paginated loyalty points ledger' })
  history(@CurrentUser() actor: AuthenticatedActor, @Query() query: QueryLoyaltyDto) {
    return this.loyalty.history(actor.userId, query.limit, query.skip);
  }

  @Post('me/redeem')
  @ApiOperation({ summary: 'Redeem loyalty points' })
  redeem(@CurrentUser() actor: AuthenticatedActor, @Body() dto: RedeemPointsDto) {
    return this.loyalty.redeem(actor.userId, dto.points);
  }

  @Get('admin/users/:userId')
  @RequirePermissions(PERMISSIONS.LOYALTY_READ)
  @ApiOperation({ summary: 'Admin: a user loyalty summary + recent activity' })
  async adminUser(@Param('userId') userId: string) {
    const [summary, history] = await Promise.all([
      this.loyalty.getSummary(userId),
      this.loyalty.history(userId, 20, 0),
    ]);
    return { ...summary, history };
  }

  @Post('admin/users/:userId/adjust')
  @RequirePermissions(PERMISSIONS.LOYALTY_MANAGE)
  @ApiOperation({ summary: 'Admin: grant or deduct points' })
  adjust(
    @Param('userId') userId: string,
    @Body() dto: AdjustPointsDto,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    return this.loyalty.adjust(userId, dto.points, dto.reason, actor.userId);
  }
}
