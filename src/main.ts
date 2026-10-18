import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { correlationIdHandler } from './common/middleware/correlation-id.handler';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  const apiPrefix = config.get<string>('apiPrefix') ?? '/api/v1';
  const port = config.get<number>('port') ?? 4000;
  const origins = config.get<string[]>('corsOrigins') ?? [];
  const trustProxy = config.get<number>('trustProxy') ?? 0;

  app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);
  app.setGlobalPrefix(apiPrefix);

  // Security headers. CSP is enforced by the Next.js middleware instead,
  // because Swagger UI and the API docs need a permissive policy.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
    }),
  );

  app.enableCors({
    origin: origins.length > 0 ? origins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id'],
    exposedHeaders: ['x-correlation-id'],
    maxAge: 86_400,
  });

  app.use(cookieParser());
  app.use(correlationIdHandler);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  if (config.get<string>('env') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Rangoli API')
      .setDescription('Bangladeshi clothing e-commerce — backend API')
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
      .addCookieAuth('rangoli_access_token')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  app.enableShutdownHooks();
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
