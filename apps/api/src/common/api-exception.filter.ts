import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { Issue } from './errors.js';

type Body = { code: string; message: string; issues?: Issue[] };

const CODES: Record<number, string> = { 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 429: 'TOO_MANY_ATTEMPTS', 400: 'VALIDATION', 404: 'NOT_FOUND', 409: 'CONFLICT', 422: 'VALIDATION' };

const MESSAGES: Record<number, string> = {
  401: 'Authentification requise.',
  403: 'Action non autorisée.',
  429: 'Trop de tentatives, réessayez plus tard.',
};

function dbCode(err: any): string | undefined {
  return err?.cause?.code ?? err?.code;
}

function toBody(err: any): [number, Body] {
  if (err instanceof HttpException) {
    const status = err.getStatus() === 400 ? 422 : err.getStatus();
    const res = err.getResponse() as any;
    if (res?.code) return [status, { code: res.code, message: res.message, ...(res.issues && { issues: res.issues }) }];
    const message = MESSAGES[status] ?? (Array.isArray(res?.message) ? res.message.join('; ') : (res?.message ?? err.message));
    return [status, { code: CODES[status] ?? 'ERROR', message }];
  }
  if (err?.name === 'ZodError') {
    const issues = (err.issues as any[]).map((i) => ({
      path: i.path.join('.'),
      rule: 'schema',
      message: i.message,
    }));
    return [422, { code: 'VALIDATION', message: 'Données invalides.', issues }];
  }
  switch (dbCode(err)) {
    case '22P02':
      return [404, { code: 'NOT_FOUND', message: 'Ressource introuvable.' }];
    case '23503':
      return [409, { code: 'CONFLICT', message: 'Cet élément est référencé par d’autres données.' }];
    case '23505':
      return [409, { code: 'CONFLICT', message: 'Cet élément existe déjà.' }];
    case '23000':
      return [409, { code: 'CONFLICT', message: 'Cet enregistrement est protégé et ne peut pas être modifié.' }];
  }
  return [500, { code: 'INTERNAL', message: 'Erreur interne.' }];
}

// pg errors carry row values in `detail` and the query in the message: log only the code and constraint.
function describe(err: any): string {
  const code = dbCode(err);
  if (code) return `database error ${code} constraint=${err?.cause?.constraint ?? err?.constraint ?? '-'} table=${err?.cause?.table ?? err?.table ?? '-'}`;
  return err instanceof Error ? `${err.name}: ${err.message}` : 'unknown error';
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(err: unknown, host: ArgumentsHost) {
    const [status, body] = toBody(err);
    if (status === 500) this.logger.error(describe(err));
    host.switchToHttp().getResponse<Response>().status(status).json(body);
  }
}
