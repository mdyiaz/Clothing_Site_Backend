export interface AppConfig {
  env: string;
  port: number;
  apiPrefix: string;
  corsOrigins: string[];
  frontendUrl: string;
  trustProxy: number;
  isProduction: boolean;
  jwt: {
    secret: string;
    refreshSecret: string;
    resetSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  cloudinary: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
  };
  mail: {
    enabled: boolean;
    provider: string;
    apiUrl: string;
    apiKey: string;
    from: string;
    fromName: string;
  };
  sms: {
    enabled: boolean;
    provider: string;
    apiUrl: string;
    apiKey: string;
    senderId: string;
  };
  shipping3pl: {
    defaultCourier: string;
    pathao: {
      enabled: boolean;
      baseUrl: string;
      clientId: string;
      clientSecret: string;
      username: string;
      password: string;
      storeId: string;
    };
    redx: {
      enabled: boolean;
      baseUrl: string;
      apiKey: string;
    };
  };
  ai: {
    groq: {
      enabled: boolean;
      apiKey: string;
      baseUrl: string;
      model: string;
    };
  };
  payments: {
    callbackBaseUrl: string;
    bkash: {
      enabled: boolean;
      baseUrl: string;
      appKey: string;
      appSecret: string;
      username: string;
      password: string;
    };
    sslcommerz: {
      enabled: boolean;
      baseUrl: string;
      storeId: string;
      storePassword: string;
    };
  };
}

export default () => {
  const origins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const config: AppConfig = {
    env: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 4000),
    apiPrefix: process.env.API_PREFIX ?? '/api/v1',
    corsOrigins: origins,
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    trustProxy: Number(process.env.TRUST_PROXY ?? 0),
    isProduction: process.env.NODE_ENV === 'production',
    jwt: {
      secret: process.env.JWT_SECRET as string,
      refreshSecret: process.env.JWT_REFRESH_SECRET as string,
      resetSecret: process.env.JWT_RESET_SECRET ?? process.env.JWT_SECRET as string,
      accessTtl: process.env.JWT_ACCESS_TTL ?? '2h',
      refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
    },
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
      apiKey: process.env.CLOUDINARY_API_KEY ?? '',
      apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
    },
    mail: {
      enabled: process.env.MAIL_ENABLED === 'true',
      provider: process.env.MAIL_PROVIDER ?? 'resend',
      apiUrl: process.env.MAIL_API_URL ?? '',
      apiKey: process.env.MAIL_API_KEY ?? '',
      from: process.env.MAIL_FROM ?? 'no-reply@rangoli.com.bd',
      fromName: process.env.MAIL_FROM_NAME ?? 'Rangoli',
    },
    sms: {
      enabled: process.env.SMS_ENABLED === 'true',
      provider: process.env.SMS_PROVIDER ?? 'generic',
      apiUrl: process.env.SMS_API_URL ?? '',
      apiKey: process.env.SMS_API_KEY ?? '',
      senderId: process.env.SMS_SENDER_ID ?? 'RANGOLI',
    },
    shipping3pl: {
      defaultCourier: process.env.THREEPL_DEFAULT_COURIER ?? 'PATHAO',
      pathao: {
        enabled: process.env.PATHAO_ENABLED === 'true',
        baseUrl: process.env.PATHAO_BASE_URL ?? 'https://api-hermes.pathao.com',
        clientId: process.env.PATHAO_CLIENT_ID ?? '',
        clientSecret: process.env.PATHAO_CLIENT_SECRET ?? '',
        username: process.env.PATHAO_USERNAME ?? '',
        password: process.env.PATHAO_PASSWORD ?? '',
        storeId: process.env.PATHAO_STORE_ID ?? '',
      },
      redx: {
        enabled: process.env.REDX_ENABLED === 'true',
        baseUrl: process.env.REDX_BASE_URL ?? 'https://openapi.redx.com.bd/v1.0.0-beta',
        apiKey: process.env.REDX_API_KEY ?? '',
      },
    },
    ai: {
      groq: {
        enabled: process.env.GROQ_ENABLED === 'true',
        apiKey: process.env.GROQ_API_KEY ?? '',
        baseUrl: process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1',
        model: process.env.GROQ_MODEL ?? 'llama-3.1-8b-instant',
      },
    },
    payments: {
      callbackBaseUrl: process.env.PAYMENT_CALLBACK_BASE_URL ?? 'http://localhost:4000/api/v1/payments',
      bkash: {
        enabled: process.env.BKASH_ENABLED === 'true',
        baseUrl: process.env.BKASH_BASE_URL ?? 'https://tokenized.sandbox.bka.sh/v1.2.0-beta',
        appKey: process.env.BKASH_APP_KEY ?? '',
        appSecret: process.env.BKASH_APP_SECRET ?? '',
        username: process.env.BKASH_USERNAME ?? '',
        password: process.env.BKASH_PASSWORD ?? '',
      },
      sslcommerz: {
        enabled: process.env.SSLCOMMERZ_ENABLED === 'true',
        baseUrl: process.env.SSLCOMMERZ_BASE_URL ?? 'https://sandbox.sslcommerz.com',
        storeId: process.env.SSLCOMMERZ_STORE_ID ?? '',
        storePassword: process.env.SSLCOMMERZ_STORE_PASSWORD ?? '',
      },
    },
  };

  return config;
};
