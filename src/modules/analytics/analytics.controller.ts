import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/permissions';
import { AnalyticsService } from './analytics.service';
import { AnalyticsRangeDto, LowStockDto, TopProductsDto } from './dto/analytics.dto';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  @RequirePermissions(PERMISSIONS.DASHBOARD_SUPER)
  @ApiOperation({ summary: 'Headline KPIs for the super-admin dashboard' })
  summary() {
    return this.analytics.summary();
  }

  @Get('sales')
  @RequirePermissions(PERMISSIONS.DASHBOARD_SUPER)
  @ApiOperation({ summary: 'Revenue/orders time series (day or month buckets)' })
  sales(@Query() query: AnalyticsRangeDto) {
    return this.analytics.sales(query.from, query.to, query.groupBy ?? 'day');
  }

  @Get('top-products')
  @RequirePermissions(PERMISSIONS.MARKETING_VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Best-selling products' })
  topProducts(@Query() query: TopProductsDto) {
    return this.analytics.topProducts(query.limit);
  }

  @Get('payments')
  @RequirePermissions(PERMISSIONS.ACCOUNTING_VIEW_REPORTS)
  @ApiOperation({ summary: 'Payment volume by method' })
  payments(@Query() query: AnalyticsRangeDto) {
    return this.analytics.paymentBreakdown(query.from, query.to);
  }

  @Get('inventory')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  @ApiOperation({ summary: 'Low / out-of-stock variants' })
  inventory(@Query() query: LowStockDto) {
    return this.analytics.lowStock(query.threshold);
  }

  @Get('customers')
  @RequirePermissions(PERMISSIONS.MARKETING_VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Customer counts (registered, guest, new 30d)' })
  customers() {
    return this.analytics.customerStats();
  }

  @Get('marketing')
  @RequirePermissions(PERMISSIONS.MARKETING_VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Marketing dashboard: coupon uptake + discount rate' })
  marketing() {
    return this.analytics.marketing();
  }

  @Get('accounting')
  @RequirePermissions(PERMISSIONS.ACCOUNTING_VIEW_REPORTS)
  @ApiOperation({ summary: 'Accounting dashboard: revenue, COD, refunds, VAT' })
  accounting() {
    return this.analytics.accounting();
  }
}
