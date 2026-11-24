import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Mailer } from '@nestjs/mail';
import { buildMail, type TemplateData, type TemplateName } from './templates.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');

  constructor(@Inject(Mailer) private readonly mailer: Mailer) {}

  // After the response: the request never waits for, or learns from, the mail server.
  queue<K extends TemplateName>(name: K, to: string, data: TemplateData[K]) {
    setImmediate(() => void this.sendNow(name, to, data));
  }

  async sendNow<K extends TemplateName>(name: K, to: string, data: TemplateData[K]) {
    try {
      const content = buildMail(name, data);
      await this.mailer.send({ ...content, to, retry: { attempts: 3, backoff: { delay: '1s' } } });
    } catch (err) {
      const who = createHash('sha256').update(to.toLowerCase()).digest('hex').slice(0, 12);
      this.logger.warn(`Mail "${name}" to ${who} failed: ${err instanceof Error ? err.name : 'error'}`);
    }
  }
}
