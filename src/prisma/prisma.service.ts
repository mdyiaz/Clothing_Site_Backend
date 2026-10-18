import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { getCorrelationId } from '../common/correlation/correlation-storage';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'production'
          ? [{ emit: 'event', level: 'warn' }]
          : [
              { emit: 'event', level: 'error' },
              { emit: 'event', level: 'warn' },
            ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Convenience: run a query inside a transaction with the correlation id available. */
  async withCorrelation<T>(fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>): Promise<T> {
    void getCorrelationId();
    return this.$transaction(fn as never) as Promise<T>;
  }
}
