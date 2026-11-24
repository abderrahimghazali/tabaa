import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { lt, sql } from 'drizzle-orm';
import { AuthDb } from '../auth/auth-db.js';
import { emailTokens, mfaChallenges, pendingSignups, sessions } from '../db/schema.js';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger('Retention');

  constructor(@Inject(AuthDb) private readonly authDb: AuthDb) {}

  @Cron('0 3 * * *')
  async daily() {
    try {
      const result = await this.run();
      this.logger.log(`Purged ${result.tenants} closed workspace(s)`);
    } catch (err) {
      this.logger.error(`Retention job failed: ${err instanceof Error ? err.name : 'error'}`);
    }
  }

  // `now` is injectable so tests can move the clock.
  async run(now = new Date()) {
    const db = this.authDb.db;
    const [{ purged }] = (
      await db.execute<{ purged: number }>(sql`select purge_closed_tenants(${now.toISOString().slice(0, 10)}::date) as purged`)
    ).rows;
    await db.delete(pendingSignups).where(lt(pendingSignups.expiresAt, now));
    await db.delete(emailTokens).where(lt(emailTokens.expiresAt, now));
    await db.delete(mfaChallenges).where(lt(mfaChallenges.expiresAt, now));
    await db.delete(sessions).where(lt(sessions.expiresAt, now));
    return { tenants: Number(purged) };
  }
}
