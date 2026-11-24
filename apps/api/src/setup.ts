import { INestApplication, StandardSchemaValidationPipe } from '@nestjs/common';
import { ApiException } from './common/errors.js';
import { env } from './env.js';

export function setup(app: INestApplication) {
  app.setGlobalPrefix('v1');
  app.enableCsrfProtection({ trustedOrigins: [env.webUrl] });
  app.enableCors({ origin: env.webUrl, credentials: true });
  app.useGlobalPipes(
    new StandardSchemaValidationPipe({
      exceptionFactory: (issues) =>
        new ApiException(
          422,
          'VALIDATION',
          'Données invalides.',
          issues.map((i) => ({
            path: (i.path ?? []).map((s) => (typeof s === 'object' ? s.key : s)).join('.'),
            rule: 'schema',
            message: i.message,
          })),
        ),
    }),
  );
}
