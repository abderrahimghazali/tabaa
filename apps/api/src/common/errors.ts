import { HttpException } from '@nestjs/common';

export type Issue = { path: string; rule: string; message: string };

export class ApiException extends HttpException {
  constructor(status: number, code: string, message: string, issues?: Issue[]) {
    super({ code, message, issues }, status);
  }
}

export const notFound = (what: string) => new ApiException(404, 'NOT_FOUND', `${what} introuvable.`);
export const conflict = (message: string) => new ApiException(409, 'CONFLICT', message);
export const invalid = (message: string, issues?: Issue[]) =>
  new ApiException(422, 'VALIDATION', message, issues);
