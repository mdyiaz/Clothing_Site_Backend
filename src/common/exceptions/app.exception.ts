import { HttpException, HttpStatus } from '@nestjs/common';
import { getCorrelationId } from '../correlation/correlation-storage';

export interface ErrorUiHint {
  field?: string;
  action?: 'focus' | 'redirect' | 'reload' | 'toast';
  message?: string;
}

export interface ErrorBody {
  code: string;
  message: string;
  ui?: ErrorUiHint;
}

export interface ApiErrorEnvelope {
  success: false;
  correlationId: string;
  error: ErrorBody;
  timestamp: string;
}

/**
 * Application-level exception. Always produces the standard error contract:
 * { success:false, correlationId, error:{ code, message, ui? }, timestamp }
 */
export class AppException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly ui?: ErrorUiHint,
  ) {
    super({ code, message, ui }, status);
  }

  static unauthorized(message = 'Please sign in to continue.'): AppException {
    return new AppException('AUTH.UNAUTHORIZED', message, HttpStatus.UNAUTHORIZED, {
      action: 'redirect',
    });
  }

  static forbidden(message = 'You do not have permission to do that.'): AppException {
    return new AppException('AUTH.FORBIDDEN', message, HttpStatus.FORBIDDEN);
  }

  static notFound(resource = 'Resource'): AppException {
    return new AppException('RESOURCE.NOT_FOUND', `${resource} was not found.`, HttpStatus.NOT_FOUND);
  }

  static conflict(code: string, message: string, ui?: ErrorUiHint): AppException {
    return new AppException(code, message, HttpStatus.CONFLICT, ui);
  }

  static badRequest(code: string, message: string, ui?: ErrorUiHint): AppException {
    return new AppException(code, message, HttpStatus.BAD_REQUEST, ui);
  }

  static tooManyRequests(message = 'Too many requests. Please slow down.'): AppException {
    return new AppException('RATE.LIMITED', message, HttpStatus.TOO_MANY_REQUESTS, {
      action: 'toast',
    });
  }

  static internal(message = 'Something went wrong. Please try again.'): AppException {
    return new AppException('SERVER.ERROR', message, HttpStatus.INTERNAL_SERVER_ERROR, {
      action: 'toast',
    });
  }

  toEnvelope(): ApiErrorEnvelope {
    const body = this.getResponse() as ErrorBody;
    return {
      success: false,
      correlationId: getCorrelationId(),
      error: {
        code: body.code,
        message: body.message,
        ...(body.ui ? { ui: body.ui } : {}),
      },
      timestamp: new Date().toISOString(),
    };
  }
}
