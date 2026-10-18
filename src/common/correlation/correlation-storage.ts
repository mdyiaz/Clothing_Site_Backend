import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestActor {
  userId: string;
  email?: string | null;
  isGuest: boolean;
  isSuperAdmin: boolean;
  roles: string[];
  permissions: string[];
  sessionVersion: number;
}

export interface RequestContext {
  correlationId: string;
  actor?: RequestActor;
}

export const requestStorage = new AsyncLocalStorage<RequestContext>();

export function createCorrelationId(headerValue?: string): string {
  const trimmed = headerValue?.trim();
  if (trimmed && /^[\w-]{8,64}$/.test(trimmed)) {
    return trimmed;
  }
  return randomUUID();
}

export function getCorrelationId(): string {
  return requestStorage.getStore()?.correlationId ?? 'unknown';
}

export function getContext(): RequestContext | undefined {
  return requestStorage.getStore();
}

export function getActor(): RequestActor | undefined {
  return requestStorage.getStore()?.actor;
}

export function setActor(actor: RequestActor): void {
  const store = requestStorage.getStore();
  if (store) {
    store.actor = actor;
  }
}
