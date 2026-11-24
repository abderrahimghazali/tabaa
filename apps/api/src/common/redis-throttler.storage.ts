import type { ThrottlerStorage } from '@nestjs/throttler';
import { Redis } from 'ioredis';

// Fixed window per key, with a block once the limit is passed. One Lua call keeps the increment atomic across instances.
const SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
local blocked = redis.call('GET', KEYS[2])
if not blocked and hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  blocked = '1'
end
local blockTtl = 0
if blocked then blockTtl = redis.call('PTTL', KEYS[2]) end
return { hits, ttl, blocked and 1 or 0, blockTtl }
`;

export class RedisThrottlerStorage implements ThrottlerStorage {
  readonly client: Redis;

  constructor(url: string) {
    this.client = new Redis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: false });
  }

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string) {
    const k = `throttle:${throttlerName}:${key}`;
    const [hits, ttlMs, blocked, blockTtl] = (await this.client.eval(
      SCRIPT,
      2,
      k,
      `${k}:block`,
      ttl,
      limit,
      blockDuration,
    )) as [number, number, number, number];
    return {
      totalHits: hits,
      timeToExpire: Math.max(0, Math.ceil(ttlMs / 1000)),
      isBlocked: blocked === 1,
      timeToBlockExpire: Math.max(0, Math.ceil(blockTtl / 1000)),
    };
  }

  close() {
    return this.client.quit();
  }
}
