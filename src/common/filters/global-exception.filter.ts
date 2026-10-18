import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ErrorLevel, Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { getCorrelationId } from '../correlation/correlation-storage';
import { AppException } from '../exceptions/app.exception';

const PRISMA_CODE_MAP: Record<string, { status: number; code: string; message: string }> = {
  P2002: {
    status: HttpStatus.CONFLICT,
    code: 'DB.UNIQUE_VIOLATION',
    message: 'That value is already taken.',
  },
  P2003: {
    status: HttpStatus.BAD_REQUEST,
    code: 'DB.RELATION_VIOLATION',
    message: 'Related record is missing or invalid.',
  },
  P2004: {
    status: HttpStatus.BAD_REQUEST,
    code: 'DB.CONSTRAINT_FAILED',
    message: 'The value violates a database constraint.',
  },
  P2005: {
    status: HttpStatus.BAD_REQUEST,
    code: 'DB.INVALID_VALUE',
    message: 'The stored value is invalid.',
  },
  P2010: {
    status: HttpStatus.BAD_REQUEST,
    code: 'DB.NULL_VIOLATION',
    message: 'A required field was empty.',
  },
  P2011: {
    status: HttpStatus.BAD_REQUEST,
    code: 'DB.NULL_CONSTRAINT',
    message: 'A required field was empty.',
  },
  P2025: {
    status: HttpStatus.NOT_FOUND,
    code: 'RESOURCE.NOT_FOUND',
    message: 'The requested record no longer exists.',
  },
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  /**
   * Prisma is optional so the filter stays unit-testable without a database.
   * In the app it is always injected (APP_FILTER + global PrismaModule).
   */
  constructor(private readonly prisma?: PrismaService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const correlationId = getCorrelationId();

    if (exception instanceof AppException) {
      const envelope = exception.toEnvelope();
      this.persist(request, correlationId, {
        status: exception.getStatus(),
        code: envelope.error.code,
        message: envelope.error.message,
        source: 'api',
      });
      response.status(exception.getStatus()).json({ ...envelope, correlationId });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = this.fromHttpException(exception);
      this.persist(request, correlationId, { status, ...body, source: 'api' });
      response.status(status).json({
        success: false,
        correlationId,
        error: body,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const prismaMapped = this.fromPrisma(exception);
    if (prismaMapped) {
      this.persist(request, correlationId, { ...prismaMapped, source: 'database' });
      response.status(prismaMapped.status).json({
        success: false,
        correlationId,
        error: { code: prismaMapped.code, message: prismaMapped.message },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const stack = exception instanceof Error ? exception.stack : undefined;
    this.logger.error(
      `Unhandled exception [${correlationId}]`,
      stack ?? String(exception),
    );
    this.persist(request, correlationId, {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'SERVER.ERROR',
      message: exception instanceof Error ? exception.message : 'Unknown error',
      stack,
      source: 'api',
    });

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      correlationId,
      error: {
        code: 'SERVER.ERROR',
        message: 'Something went wrong. Please try again.',
        ui: { action: 'toast' },
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Fire-and-forget ErrorLog write. Never throws, never blocks the response —
   * a failing analytics insert must not turn into a second error.
   */
  private persist(
    request: Request | undefined,
    correlationId: string | undefined,
    entry: { status: number; code: string; message: string; stack?: string; source: string },
  ): void {
    if (!this.prisma) return;
    if (entry.status < 400) return;

    const level =
      entry.status >= 500 ? ErrorLevel.CRITICAL : entry.status >= 400 ? ErrorLevel.ERROR : ErrorLevel.WARNING;

    const user = request?.user;
    const url = request?.originalUrl ?? request?.url;

    void this.prisma.errorLog
      .create({
        data: {
          correlationId: correlationId ?? null,
          level,
          source: entry.source,
          code: entry.code,
          message: entry.message.slice(0, 4000),
          stackTrace: entry.stack,
          context: request
            ? (redact({
                body: request.body,
                query: request.query,
                params: request.params,
              }) as Prisma.InputJsonValue)
            : undefined,
          userId: user?.userId ?? null,
          userRole: user?.roles?.[0] ?? null,
          path: url ? url.split('?')[0] : null,
          method: request?.method ?? null,
          ipAddress: request?.ip ?? null,
          userAgent: (request?.headers?.['user-agent'] as string | undefined) ?? null,
          statusCode: entry.status,
        },
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to persist error log (${entry.code})`,
          error instanceof Error ? error.message : String(error),
        );
      });
  }

  private fromHttpException(exception: HttpException): { code: string; message: string; ui?: unknown } {
    const status = exception.getStatus();
    const payload = exception.getResponse();

    if (typeof payload === 'object' && payload !== null) {
      const body = payload as Record<string, unknown>;
      const code = typeof body.code === 'string' ? body.code : `HTTP.${status}`;
      const message =
        typeof body.message === 'string'
          ? body.message
          : Array.isArray(body.message)
            ? (body.message as string[]).join(' ')
            : exception.message;
      const ui = body.ui;
      return { code, message, ...(ui ? { ui } : {}) };
    }

    return { code: `HTTP.${status}`, message: String(payload) };
  }

  private fromPrisma(exception: unknown): { status: number; code: string; message: string } | null {
    if (typeof exception !== 'object' || exception === null) {
      return null;
    }
    const err = exception as { name?: string; code?: unknown };
    if (err.name !== 'PrismaClientKnownRequestError' || typeof err.code !== 'string') {
      return null;
    }
    return PRISMA_CODE_MAP[err.code] ?? {
      status: HttpStatus.BAD_REQUEST,
      code: 'DB.ERROR',
      message: 'The request could not be completed.',
    };
  }
}

const SENSITIVE_KEY = /password|passwd|secret|token|otp|pin|authorization|cookie/i;

/**
 * Deep-clones request context for the error log with secrets redacted.
 * Error logs must never store plaintext passwords, tokens, or OTPs.
 */
function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    return value.map((item) => redact(item, seen));
  }
  if (typeof value === 'object' && value !== null) {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redact(entry, seen);
    }
    return out;
  }
  return value;
}
