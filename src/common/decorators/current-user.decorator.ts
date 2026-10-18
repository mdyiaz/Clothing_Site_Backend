import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedActor } from '../../types/express';

export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedActor | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedActor }>();
    return field ? request.user?.[field] : request.user;
  },
);
