import type { Role } from '@facture/core';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  tenantId: string;
  tenantName: string;
  role: Role;
  mfaEnabled: boolean;
}

declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    user: AuthUser;
    sessionExtra: { user: AuthUser };
  }
}
