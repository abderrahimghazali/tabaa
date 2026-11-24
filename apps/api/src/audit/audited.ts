import { SetMetadata } from '@nestjs/common';

export interface AuditMeta {
  action: string;
  entity: string;
  idFrom?: 'param' | 'result';
  summary?: (req: any, result: any) => string | undefined;
}

export const AUDIT = 'audit';
export const Audited = (meta: AuditMeta) => SetMetadata(AUDIT, meta);
