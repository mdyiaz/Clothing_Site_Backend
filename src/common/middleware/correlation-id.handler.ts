import { NextFunction, Request, Response } from 'express';
import { createCorrelationId, requestStorage } from '../correlation/correlation-storage';

export const CORRELATION_HEADER = 'x-correlation-id';

/**
 * Assigns a correlation id to every request and runs the rest of the pipeline
 * inside an AsyncLocalStorage context so logs, Prisma queries and the response
 * envelope can all reference it.
 */
export function correlationIdHandler(req: Request, res: Response, next: NextFunction): void {
  const correlationId = createCorrelationId(
    req.header(CORRELATION_HEADER) ?? req.header('x-request-id'),
  );

  req.correlationId = correlationId;
  res.setHeader(CORRELATION_HEADER, correlationId);

  requestStorage.run({ correlationId }, () => next());
}
