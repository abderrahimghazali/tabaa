import { INestApplication, StandardSchemaValidationPipe } from '@nestjs/common';
import { clientIpMiddleware } from './common/client-ip.js';
import { ApiException } from './common/errors.js';
import { env } from './env.js';

export function setup(app: INestApplication) {
  app.useSecurityHeaders({
    contentSecurityPolicy: { useDefaults: false, directives: { 'default-src': ["'none'"], 'frame-ancestors': ["'none'"] } },
    xFrameOptions: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-site' },
    strictTransportSecurity: env.nodeEnv !== 'development',
  });
  app.enableCsrfProtection({ trustedOrigins: [env.webUrl] });
  app.use(clientIpMiddleware);
  app.use((_req: unknown, res: { setHeader(k: string, v: string): void }, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.setGlobalPrefix('v1');
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
