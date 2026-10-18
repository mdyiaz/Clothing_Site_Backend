import { BadRequestException, ForbiddenException, HttpException, Logger } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception';
import { GlobalExceptionFilter } from './global-exception.filter';

function makeHost(request: Record<string, unknown>) {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => res,
    }),
  };
  return { host: host as any, res };
}

const BASE_REQUEST = {
  method: 'POST',
  url: '/api/v1/products?page=1',
  originalUrl: '/api/v1/products?page=1',
  body: {},
  query: { page: '1' },
  params: {},
  ip: '127.0.0.1',
  headers: { 'user-agent': 'jest' },
};

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('GlobalExceptionFilter', () => {
  let prisma: { errorLog: { create: jest.Mock } };
  let filter: GlobalExceptionFilter;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = { errorLog: { create: jest.fn().mockResolvedValue({ id: 'log1' }) } };
    filter = new GlobalExceptionFilter(prisma as any);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('persists AppException failures with their code and status', async () => {
    const { host, res } = makeHost({ ...BASE_REQUEST, user: { userId: 'u1', roles: ['owner'] } });

    filter.catch(AppException.badRequest('PRODUCT.SKU_TAKEN', 'SKU "X" is already in use.'), host);
    await flush();

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0]).toMatchObject({
      success: false,
      error: { code: 'PRODUCT.SKU_TAKEN' },
    });
    expect(prisma.errorLog.create).toHaveBeenCalledTimes(1);

    const data = prisma.errorLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      level: 'ERROR',
      source: 'api',
      code: 'PRODUCT.SKU_TAKEN',
      statusCode: 400,
      path: '/api/v1/products',
      method: 'POST',
      ipAddress: '127.0.0.1',
      userId: 'u1',
      userRole: 'owner',
    });
  });

  it('falls back to HTTP.<status> codes for plain HttpExceptions', async () => {
    const { host, res } = makeHost(BASE_REQUEST);

    filter.catch(new ForbiddenException('Nope'), host);
    await flush();

    expect(res.status).toHaveBeenCalledWith(403);
    expect(prisma.errorLog.create.mock.calls[0][0].data).toMatchObject({
      level: 'ERROR',
      code: 'HTTP.403',
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('joins array messages from validation errors', async () => {
    const { host, res } = makeHost(BASE_REQUEST);

    filter.catch(new BadRequestException(['name is required', 'price must be a number']), host);
    await flush();

    expect(res.json.mock.calls[0][0].error.message).toBe('name is required price must be a number');
    expect(prisma.errorLog.create.mock.calls[0][0].data.level).toBe('ERROR');
  });

  it('maps Prisma errors to the database source', async () => {
    const { host, res } = makeHost(BASE_REQUEST);
    const prismaError = Object.assign(new Error('Unique constraint'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
    });

    filter.catch(prismaError, host);
    await flush();

    expect(res.status).toHaveBeenCalledWith(409);
    expect(prisma.errorLog.create.mock.calls[0][0].data).toMatchObject({
      level: 'ERROR',
      source: 'database',
      code: 'DB.UNIQUE_VIOLATION',
    });
  });

  it('treats unknown exceptions as CRITICAL 500s without leaking internals', async () => {
    const { host, res } = makeHost(BASE_REQUEST);

    filter.catch(new Error('db connection exploded'), host);
    await flush();

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error).toMatchObject({
      code: 'SERVER.ERROR',
      message: 'Something went wrong. Please try again.',
    });
    expect(errorSpy).toHaveBeenCalled();

    const data = prisma.errorLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ level: 'CRITICAL', statusCode: 500 });
    expect(data.stackTrace).toContain('db connection exploded');
  });

  it('redacts secrets from the stored request context', async () => {
    const { host } = makeHost({
      ...BASE_REQUEST,
      body: {
        email: 'admin@rangoli.com.bd',
        password: 'super-secret',
        nested: { refreshToken: 'abc', keep: 'yes' },
      },
      headers: { cookie: 'rangoli_refresh_token=xyz', 'user-agent': 'jest' },
    });

    filter.catch(AppException.unauthorized('Nope'), host);
    await flush();

    const context = prisma.errorLog.create.mock.calls[0][0].data.context;
    expect(context.body.email).toBe('admin@rangoli.com.bd');
    expect(context.body.password).toBe('[redacted]');
    expect(context.body.nested.refreshToken).toBe('[redacted]');
    expect(context.body.nested.keep).toBe('yes');
  });

  it('still responds when the ErrorLog insert itself fails', async () => {
    prisma.errorLog.create.mockRejectedValue(new Error('db down'));
    const { host, res } = makeHost(BASE_REQUEST);

    filter.catch(new HttpException('Gone', 500), host);
    await flush();

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('works without a database (persist becomes a no-op)', () => {
    const plain = new GlobalExceptionFilter();
    const { host, res } = makeHost(BASE_REQUEST);

    expect(() => plain.catch(AppException.notFound('Product'), host)).not.toThrow();
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
