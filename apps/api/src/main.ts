import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';
import { env } from './env.js';
import { setup } from './setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  setup(app);
  await app.listen(env.port);
}
await bootstrap();
