import 'express';

export interface AuthenticatedActor {
  userId: string;
  email?: string | null;
  isGuest: boolean;
  isSuperAdmin: boolean;
  /** Role slugs assigned to the user. */
  roles: string[];
  /** Flattened menu + action permissions from every assigned role. */
  permissions: string[];
  sessionVersion: number;
}

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      user?: AuthenticatedActor;
    }
  }
}
