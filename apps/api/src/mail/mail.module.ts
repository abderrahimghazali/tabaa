import { Global, Module } from '@nestjs/common';
import { InMemoryMailTransport, MailModule as NestMailModule, SmtpTransport } from '@nestjs/mail';
import { env } from '../env.js';
import { MailService } from './mail.service.js';

@Global()
@Module({
  imports: [
    NestMailModule.forRoot({
      transport: env.nodeEnv === 'test' ? new InMemoryMailTransport() : new SmtpTransport({ url: env.smtpUrl }),
      from: env.mailFrom,
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
