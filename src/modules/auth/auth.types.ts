export interface SessionRole {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  icon: string | null;
}

export interface SessionUser {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  isGuest: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  loyaltyPoints: number;
  loyaltyTier: string;
  isSuperAdmin: boolean;
  roles: SessionRole[];
  permissions: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResult extends AuthTokens {
  user: SessionUser;
}

export interface RefreshPayload {
  sub: string;
  sv: number;
  typ: 'refresh';
}

export interface ResetPayload {
  sub: string;
  sv: number;
  pv: string;
  typ: 'reset';
}
