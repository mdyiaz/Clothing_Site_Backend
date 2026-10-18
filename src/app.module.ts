import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuthModule } from './modules/auth/auth.module';
import { BannersModule } from './modules/banners/banners.module';
import { CacheModule } from './modules/cache/cache.module';
import { CartModule } from './modules/cart/cart.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ChatbotModule } from './modules/chatbot/chatbot.module';
import { CollectionsModule } from './modules/collections/collections.module';
import { DiscountsModule } from './modules/discounts/discounts.module';
import { FooterModule } from './modules/footer/footer.module';
import { HealthModule } from './modules/health/health.module';
import { HomepageModule } from './modules/homepage/homepage.module';
import { LoyaltyModule } from './modules/loyalty/loyalty.module';
import { MediaModule } from './modules/media/media.module';
import { NavbarModule } from './modules/navbar/navbar.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrderModule } from './modules/orders/order.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ProductsModule } from './modules/products/products.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { RolesModule } from './modules/roles/roles.module';
import { SearchModule } from './modules/search/search.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { SystemHealthModule } from './modules/system-health/system-health.module';
import { UsersModule } from './modules/users/users.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: [configuration],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    CacheModule,
    CartModule,
    AuthModule,
    RolesModule,
    CategoriesModule,
    ProductsModule,
    ReviewsModule,
    SearchModule,
    MediaModule,
    CollectionsModule,
    DiscountsModule,
    HomepageModule,
    BannersModule,
    NavbarModule,
    NotificationsModule,
    PaymentsModule,
    LoyaltyModule,
    OrderModule,
    FooterModule,
    SettingsModule,
    SystemHealthModule,
    UsersModule,
    WishlistModule,
    AnalyticsModule,
    ChatbotModule,
    ShippingModule,
    HealthModule,
  ],
  providers: [
    // Order matters: rate-limit first (cheap), then authenticate, then authorize.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
