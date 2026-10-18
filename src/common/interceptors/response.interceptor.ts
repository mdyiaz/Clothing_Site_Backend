import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { getCorrelationId } from '../correlation/correlation-storage';
import { isPaginatedResult, PaginationMeta } from '../base/paginated-result';

export interface ApiSuccessEnvelope<T = unknown> {
  success: true;
  correlationId: string;
  data: T;
  meta?: PaginationMeta;
  timestamp: string;
}

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((payload) => this.toEnvelope(payload)));
  }

  private toEnvelope(payload: unknown): unknown {
    if (this.isAlreadyEnveloped(payload)) {
      return payload;
    }

    const base = {
      success: true as const,
      correlationId: getCorrelationId(),
      timestamp: new Date().toISOString(),
    };

    if (isPaginatedResult(payload)) {
      return { ...base, data: payload.items, meta: payload.meta };
    }

    if (payload === undefined) {
      return { ...base, data: null };
    }

    return { ...base, data: payload };
  }

  private isAlreadyEnveloped(payload: unknown): boolean {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      'success' in payload &&
      'correlationId' in payload
    );
  }
}
