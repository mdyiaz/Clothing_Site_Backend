import { z } from 'zod';

/**
 * Fail fast on boot: every secret is validated before the app accepts traffic.
 * `.env.example` documents every key.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_PREFIX: z.string().min(1).default('/api/v1'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  FRONTEND_URL: z.string().optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_RESET_SECRET: z.string().optional(),
  JWT_ACCESS_TTL: z.string().default('2h'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  NEXTAUTH_SECRET: z.string().optional(),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  MAIL_ENABLED: z.enum(['true', 'false']).default('false'),
  MAIL_PROVIDER: z.string().default('resend'),
  MAIL_API_URL: z.string().optional(),
  MAIL_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  MAIL_FROM_NAME: z.string().optional(),

  SMS_ENABLED: z.enum(['true', 'false']).default('false'),
  SMS_PROVIDER: z.string().default('generic'),
  SMS_API_URL: z.string().optional(),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),

  PAYMENT_CALLBACK_BASE_URL: z.string().optional(),
  BKASH_ENABLED: z.enum(['true', 'false']).default('false'),
  BKASH_BASE_URL: z.string().optional(),
  BKASH_APP_KEY: z.string().optional(),
  BKASH_APP_SECRET: z.string().optional(),
  BKASH_USERNAME: z.string().optional(),
  BKASH_PASSWORD: z.string().optional(),

  SSLCOMMERZ_ENABLED: z.enum(['true', 'false']).default('false'),
  SSLCOMMERZ_BASE_URL: z.string().optional(),
  SSLCOMMERZ_STORE_ID: z.string().optional(),
  SSLCOMMERZ_STORE_PASSWORD: z.string().optional(),

  THREEPL_DEFAULT_COURIER: z.string().optional(),
  PATHAO_ENABLED: z.enum(['true', 'false']).default('false'),
  PATHAO_BASE_URL: z.string().optional(),
  PATHAO_CLIENT_ID: z.string().optional(),
  PATHAO_CLIENT_SECRET: z.string().optional(),
  PATHAO_USERNAME: z.string().optional(),
  PATHAO_PASSWORD: z.string().optional(),
  PATHAO_STORE_ID: z.string().optional(),
  REDX_ENABLED: z.enum(['true', 'false']).default('false'),
  REDX_BASE_URL: z.string().optional(),
  REDX_API_KEY: z.string().optional(),

  GROQ_ENABLED: z.enum(['true', 'false']).default('false'),
  GROQ_API_KEY: z.string().optional(),
  GROQ_BASE_URL: z.string().optional(),
  GROQ_MODEL: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'log', 'debug', 'verbose'])
    .default('log'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
