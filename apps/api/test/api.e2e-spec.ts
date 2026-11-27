import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { Logger } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import { InMemoryMailTransport, MailTransport } from '@nestjs/mail';

const { AppModule } = await import('../src/app.module.js');
const { setup } = await import('../src/setup.js');
const { Dashboard } = await import('@facture/core');
const { Decimal } = await import('decimal.js');
const { env, parseEnv } = await import('../src/env.js');
const { AuthService } = await import('../src/auth/auth.service.js');
const { RetentionService } = await import('../src/retention/retention.service.js');
const { clock } = await import('../src/common/clock.js');
const policy = await import('../src/auth/security-policy.js');
const { AuditEvent } = await import('@facture/core');
const { execFileSync } = await import('node:child_process');
const { readdirSync, readFileSync } = await import('node:fs');
const { wipeTenant } = await import('../src/db/wipe.js');

const company = {
  name: 'Test Société SARL',
  address: { line1: '1 rue du Test', city: 'Casablanca' },
  ice: '002876543000091',
  ifNumber: '45678123',
  rcNumber: '1234',
  rcCourt: 'Casablanca',
  tpNumber: '5678',
  cnssNumber: '9012',
  rib: '007780000123400045678912',
};
const customerBody = {
  name: 'Client Test SARL',
  ice: '001509876000041',
  address: { line1: '5 avenue Hassan II', city: 'Rabat' },
};
const line = { description: 'Prestation de conseil', quantity: '2', unit: 'jour', unitPrice: '1000', vatRate: '20' };

let app: INestApplication;
let http: ReturnType<typeof request>;
let admin: Pool;
let appPool: Pool;
let customerId: string;
let anon: ReturnType<typeof request>;
let TENANT: string;
let meUser: { id: string };
let transport: InMemoryMailTransport;
const tenantIds: string[] = [];
const PASSWORD = 'correct-horse-battery';
const uniqueEmail = (tag: string) => `${tag}-${Math.random().toString(36).slice(2, 10)}@example.test`;

const pdfBytes = (tag = 'x') =>
  Buffer.from(`%PDF-1.4\n% ${tag}\n1 0 obj << /Type /Catalog >> endobj\n2 0 obj << /Type /Page >> endobj\n% ${'pad '.repeat(300)}\n%%EOF\n`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const mailsTo = (email: string) => transport.mails.filter((m) => m.to.some((a) => a.address === email.toLowerCase()));

const waitMail = async (email: string, subject: string) => {
  for (let i = 0; i < 100; i++) {
    const m = mailsTo(email).filter((x) => x.subject.includes(subject)).at(-1);
    if (m) return m;
    await sleep(30);
  }
  throw new Error(`No mail "${subject}" for ${email}`);
};

const tokenOf = (mail: { links: string[] }) =>
  new URL(mail.links.find((l) => l.includes('token='))!).searchParams.get('token')!;

// Sign-up now needs the emailed link: this goes through both steps and returns the verification response.
const signUp = async (agent: ReturnType<typeof request>, email = uniqueEmail('owner'), password = PASSWORD) => {
  const res = await agent.post('/v1/auth/sign-up').send({ name: 'Test User', email, password, companyName: 'Société Test' });
  if (res.status !== 202) return res;
  const mail = await waitMail(email, 'Confirmez');
  const verified = await agent.post('/v1/auth/verify-email').send({ token: tokenOf(mail) });
  if (verified.status === 201) tenantIds.push(verified.body.tenant.id);
  return verified;
};

const base32 = (s: string) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.replace(/=+$/, '')) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  return Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
};

// RFC 6238, SHA-1, 6 digits, 30 s, at the app's (shiftable) clock.
const totp = (secret: string, stepOffset = 0) => {
  const counter = Math.floor(clock.now() / 1000 / 30) + stepOffset;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32(secret)).update(buf).digest();
  const o = h[19] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
};

const draft = async (body: Record<string, unknown> = {}) =>
  (await http.post('/v1/invoices').send({ customerId, issueDate: '2026-03-10', lines: [line], ...body }).expect(201)).body;
const issue = (id: string) => http.post(`/v1/invoices/${id}/issue`);

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  setup(app);
  await app.init();
  transport = app.get(MailTransport) as InMemoryMailTransport;
  anon = request(app.getHttpServer()) as never;
  http = request.agent(app.getHttpServer()) as never;
  const me = await signUp(http);
  expect(me.status).toBe(201);
  TENANT = me.body.tenant.id;
  meUser = me.body.user;
  admin = new Pool({ connectionString: env.adminUrl });
  appPool = new Pool({ connectionString: env.appUrl });
});

afterAll(async () => {
  await app.close();
  await admin.end();
  await appPool.end();
  for (const id of tenantIds) await wipeTenant(id);
});

describe('auth', () => {
  it('sign-up creates tenant and OWNER, sets the cookie, and /me works', async () => {
    const email = uniqueEmail('Fresh');
    const agent = request.agent(app.getHttpServer());
    const res = await signUp(agent as never, email);
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('OWNER');
    expect(res.body.user.email).toBe(email.toLowerCase());
    expect(res.body.tenant.name).toBe('Société Test');
    const cookie = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cookie).toMatch(/tabaa_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect((await agent.get('/v1/me').expect(200)).body).toEqual(res.body);
  });

  it('answers 401 without a session on business routes', async () => {
    await anon.get('/v1/me').expect(401);
    for (const path of ['/v1/company', '/v1/parties', '/v1/items', '/v1/invoices', '/v1/dashboard']) {
      const res = await anon.get(path);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    }
    await anon.post('/v1/parties').send(customerBody).expect(401);
    await anon.delete('/v1/payments/00000000-0000-4000-8000-000000000000').expect(401);
  });

  it('rejects weak passwords and the email as password', async () => {
    await signUp(anon, uniqueEmail('weak'), 'short').then((r) => expect(r.status).toBe(422));
    const email = uniqueEmail('same');
    await signUp(anon, email, email).then((r) => expect(r.status).toBe(422));
  });

  it('answers wrong password and unknown email identically', async () => {
    const email = uniqueEmail('wrong');
    await signUp(anon, email);
    const wrong = await anon.post('/v1/auth/sign-in').send({ email, password: 'not-the-password' });
    const unknown = await anon.post('/v1/auth/sign-in').send({ email: uniqueEmail('ghost'), password: 'not-the-password' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('signs in, then rate-limits repeated attempts', async () => {
    const email = uniqueEmail('limit');
    await signUp(anon, email);
    const ok = await anon.post('/v1/auth/sign-in').send({ email, password: PASSWORD }).expect(200);
    expect(ok.body.user.email).toBe(email);
    const statuses: number[] = [];
    for (let i = 0; i < 30; i++) {
      statuses.push((await anon.post('/v1/auth/sign-in').send({ email, password: 'bad-password-1' })).status);
    }
    expect(statuses).toContain(429);
    const limited = await anon.post('/v1/auth/sign-in').send({ email, password: 'bad-password-1' });
    expect(limited.body.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('sign-out revokes the session', async () => {
    const agent = request.agent(app.getHttpServer());
    const res = await signUp(agent as never);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    await anon.get('/v1/me').set('Cookie', cookie).expect(200);
    await agent.post('/v1/auth/sign-out').expect(204);
    const after = await anon.get('/v1/me').set('Cookie', cookie);
    expect(after.status).toBe(401);
  });

  it('resets a password once and revokes sessions', async () => {
    const email = uniqueEmail('reset');
    const agent = request.agent(app.getHttpServer());
    const res = await signUp(agent as never, email);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

    await anon.post('/v1/auth/password/forgot').send({ email }).expect(204);
    await anon.post('/v1/auth/password/forgot').send({ email: uniqueEmail('nobody') }).expect(204);
    const mail = await waitMail(email, 'Réinitialisation');
    const token = tokenOf(mail);
    expect(mail.links.some((l) => l.includes('/reinitialiser?token='))).toBe(true);

    const newPassword = 'another-long-password';
    await anon.post('/v1/auth/password/reset').send({ token, password: newPassword }).expect(204);
    const reuse = await anon.post('/v1/auth/password/reset').send({ token, password: 'yet-another-password' });
    expect(reuse.status).toBe(422);
    expect(reuse.body.code).toBe('INVALID_TOKEN');
    expect((await anon.get('/v1/me').set('Cookie', cookie)).status).toBe(401);
    await anon.post('/v1/auth/sign-in').send({ email, password: PASSWORD }).expect(401);
    await anon.post('/v1/auth/sign-in').send({ email, password: newPassword }).expect(200);
    await waitMail(email, 'mot de passe a été modifié');
  });

  it('isolates tenants through real sessions', async () => {
    const other = request.agent(app.getHttpServer());
    await signUp(other as never);
    await other.put('/v1/company').send(company).expect(200);
    const party = (await other.post('/v1/parties').send(customerBody).expect(201)).body;
    const inv = (await other.post('/v1/invoices').send({ customerId: party.id, issueDate: '2026-03-10', lines: [line] }).expect(201)).body;
    await http.get(`/v1/parties/${party.id}`).expect(404);
    await http.get(`/v1/invoices/${inv.id}`).expect(404);
    expect((await http.get('/v1/parties')).body.some((p: { id: string }) => p.id === party.id)).toBe(false);
    expect((await other.get('/v1/parties')).body).toHaveLength(1);
  });

  it('lets a VIEWER read but not write', async () => {
    const viewer = request.agent(app.getHttpServer());
    const email = uniqueEmail('viewer');
    const res = await signUp(viewer as never, email);
    await admin.query("update memberships set role = 'VIEWER' where user_id = $1", [res.body.user.id]);
    await viewer.get('/v1/parties').expect(200);
    const denied = await viewer.post('/v1/parties').send(customerBody).expect(403);
    expect(denied.body.code).toBe('FORBIDDEN');
    expect((await viewer.get('/v1/me')).body.role).toBe('VIEWER');
  });

  it('rejects a foreign Origin on writes', async () => {
    const res = await http.post('/v1/parties').set('Origin', 'http://evil.example').send(customerBody);
    expect(res.status).toBe(403);
    await http.post('/v1/parties').set('Origin', 'http://localhost:3100').send(customerBody).expect(201);
  });
});

describe('company', () => {
  it('requires a company before drafting', async () => {
    expect((await http.get('/v1/company').expect(200)).body).toBeNull();
    const party = await http.post('/v1/parties').send(customerBody).expect(201);
    customerId = party.body.id;
    const res = await http.post('/v1/invoices').send({ customerId, issueDate: '2026-03-10', lines: [line] }).expect(409);
    expect(res.body.code).toBe('CONFLICT');
  });

  it('upserts', async () => {
    const created = await http.put('/v1/company').send(company).expect(200);
    expect(created.body.name).toBe(company.name);
    const updated = await http.put('/v1/company').send({ ...company, name: 'Renommée SARL' }).expect(200);
    expect(updated.body.id).toBe(created.body.id);
    expect((await http.get('/v1/company')).body.name).toBe('Renommée SARL');
  });

  it('rejects an invalid body with 422', async () => {
    const res = await http.put('/v1/company').send({ name: '' }).expect(422);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.issues.length).toBeGreaterThan(0);
  });
});

describe('parties', () => {
  it('supports CRUD and blocks deleting a referenced party', async () => {
    const created = (await http.post('/v1/parties').send({ ...customerBody, name: 'Éphémère SARL', ice: '001509876000042' }).expect(201)).body;
    expect((await http.get(`/v1/parties/${created.id}`).expect(200)).body.name).toBe('Éphémère SARL');
    const patched = (await http.patch(`/v1/parties/${created.id}`).send({ phone: '+212 5 22 00 00 00' }).expect(200)).body;
    expect(patched.phone).toBe('+212 5 22 00 00 00');
    expect(patched.name).toBe('Éphémère SARL');
    expect((await http.get('/v1/parties?q=phém').expect(200)).body).toHaveLength(1);
    await http.delete(`/v1/parties/${created.id}`).expect(204);
    await http.get(`/v1/parties/${created.id}`).expect(404);
  });

  it('refuses to delete a party used by an invoice', async () => {
    const p = (await http.post('/v1/parties').send({ ...customerBody, name: 'Utilisé SARL' }).expect(201)).body;
    await draft({ customerId: p.id });
    await http.delete(`/v1/parties/${p.id}`).expect(409);
  });
});

describe('invoices', () => {
  it('computes totals and default due date on a draft', async () => {
    const inv = await draft();
    expect(inv.state).toBe('DRAFT');
    expect(inv.number).toBeNull();
    expect(inv.totals.totalNet).toBe('2000.00');
    expect(inv.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(inv.language).toBe('fr');
    expect(inv.amountInWords.fr).toBeTruthy();
  });

  it('allocates consecutive numbers on issue', async () => {
    const a = (await issue((await draft()).id).expect(200)).body;
    const b = (await issue((await draft()).id).expect(200)).body;
    expect(a.number).toBe('FA-2026-00001');
    expect(b.number).toBe('FA-2026-00002');
    expect(a.state).toBe('ISSUED');
    expect(a.issuedAt).toBeTruthy();
  });

  it('never allocates the same number to concurrent issues', async () => {
    const drafts = await Promise.all(Array.from({ length: 6 }, () => draft()));
    const results = await Promise.all(drafts.map((d) => issue(d.id)));
    results.forEach((r) => expect(r.status).toBe(200));
    const numbers = results.map((r) => r.body.number as string).sort();
    expect(new Set(numbers).size).toBe(6);
    expect(numbers).toEqual(['FA-2026-00003', 'FA-2026-00004', 'FA-2026-00005', 'FA-2026-00006', 'FA-2026-00007', 'FA-2026-00008']);
  });

  it('rejects PATCH and DELETE on an issued invoice', async () => {
    const issued = (await issue((await draft()).id).expect(200)).body;
    await http.patch(`/v1/invoices/${issued.id}`).send({ customerId, issueDate: '2026-03-10', lines: [line] }).expect(409);
    await http.delete(`/v1/invoices/${issued.id}`).expect(409);
    await issue(issued.id).expect(409);
  });

  it('is immutable at the database level', async () => {
    const issued = (await issue((await draft()).id).expect(200)).body;
    await expect(
      admin.query('update invoices set notes = $1 where id = $2', ['hack', issued.id]),
    ).rejects.toThrow(/immuable/);
    await expect(admin.query('delete from invoices where id = $1', [issued.id])).rejects.toThrow(/immuable/);
  });

  it('blocks issue when the customer ICE is invalid', async () => {
    const bad = (await http.post('/v1/parties').send({ ...customerBody, name: 'ICE invalide', ice: '123' }).expect(201)).body;
    const res = await issue((await draft({ customerId: bad.id })).id).expect(422);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.issues.map((i: { rule: string }) => i.rule)).toContain('MA-ICE-BUYER');
  });

  it('edits and deletes drafts', async () => {
    const d = await draft();
    const updated = (await http.patch(`/v1/invoices/${d.id}`).send({ customerId, issueDate: '2026-03-10', lines: [{ ...line, quantity: '3' }] }).expect(200)).body;
    expect(updated.totals.totalNet).toBe('3000.00');
    await http.delete(`/v1/invoices/${d.id}`).expect(204);
    await http.get(`/v1/invoices/${d.id}`).expect(404);
  });

  it('tracks payments and rejects overpayment', async () => {
    const inv = (await issue((await draft()).id).expect(200)).body;
    const due = inv.totals.amountDue as string;
    expect(inv.paymentStatus).toBe('UNPAID');

    await http.post(`/v1/invoices/${inv.id}/payments`).send({ paidOn: '2026-03-15', method: 'TRANSFER', amount: '0' }).expect(422);
    await http.post(`/v1/invoices/${inv.id}/payments`).send({ paidOn: '2026-03-15', method: 'TRANSFER', amount: '999999' }).expect(422);

    const part = (await http.post(`/v1/invoices/${inv.id}/payments`).send({ paidOn: '2026-03-15', method: 'TRANSFER', amount: '100.00' }).expect(201)).body;
    expect(part.paymentStatus).toBe('PARTIALLY_PAID');
    expect(part.paidAmount).toBe('100.00');
    expect(part.payments).toHaveLength(1);

    const rest = (Number(due) - 100).toFixed(2);
    const full = (await http.post(`/v1/invoices/${inv.id}/payments`).send({ paidOn: '2026-03-20', method: 'CHEQUE', amount: rest }).expect(201)).body;
    expect(full.paymentStatus).toBe('PAID');
    await http.post(`/v1/invoices/${inv.id}/payments`).send({ paidOn: '2026-03-21', method: 'CASH', amount: '1.00' }).expect(422);

    const after = (await http.delete(`/v1/payments/${full.payments[1].id}`).expect(200)).body;
    expect(after.paymentStatus).toBe('PARTIALLY_PAID');

    const drafted = await draft();
    await http.post(`/v1/invoices/${drafted.id}/payments`).send({ paidOn: '2026-03-15', method: 'CASH', amount: '10' }).expect(409);
  });

  it('lists and filters', async () => {
    expect((await http.get('/v1/invoices?state=DRAFT').expect(200)).body.every((i: { state: string }) => i.state === 'DRAFT')).toBe(true);
    const overdue = (await http.get('/v1/invoices?status=OVERDUE').expect(200)).body;
    expect(overdue.length).toBeGreaterThan(0);
    expect(overdue.every((i: { overdue: boolean }) => i.overdue)).toBe(true);
    expect((await http.get('/v1/invoices?q=FA-2026-00001').expect(200)).body).toHaveLength(1);
  });

  it('creates a credit note draft from an issued invoice', async () => {
    const inv = (await issue((await draft()).id).expect(200)).body;
    const cn = (await http.post(`/v1/invoices/${inv.id}/credit-note`).expect(201)).body;
    expect(cn.type).toBe('CREDIT_NOTE');
    expect(cn.state).toBe('DRAFT');
    expect(cn.originalInvoiceId).toBe(inv.id);
    expect(cn.customer.id).toBe(customerId);
    expect(cn.totals.totalNet).toBe(inv.totals.totalNet);
    await http.post(`/v1/invoices/${(await draft()).id}/credit-note`).expect(409);
    const issuedCn = (await issue(cn.id).expect(200)).body;
    expect(issuedCn.number).toMatch(/^AV-\d{4}-00001$/);
  });

  it('serves UBL XML for issued invoices only', async () => {
    const inv = (await issue((await draft()).id).expect(200)).body;
    const res = await http.get(`/v1/invoices/${inv.id}/ubl`).expect(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expect(res.text).toContain('<');
    expect(res.text).toContain(inv.number);
    await http.get(`/v1/invoices/${(await draft()).id}/ubl`).expect(409);
  });
});

describe('dashboard', () => {
  it('returns the aggregate shape', async () => {
    const res = (await http.get('/v1/dashboard').expect(200)).body;
    expect(Number(res.outstanding)).toBeGreaterThan(0);
    expect(res.draftCount).toBeGreaterThan(0);
    expect(Array.isArray(res.receivables)).toBe(true);
    expect(res.recentPayments.length).toBeGreaterThan(0);
    const parsed = Dashboard.parse(res);
    expect(parsed.monthly).toHaveLength(6);
    const aging = Object.values(parsed.aging).reduce((a, v) => a.plus(v), new Decimal(0));
    expect(aging.toFixed(2)).toBe(parsed.outstanding);
  });
});

describe('row-level security', () => {
  const count = async (tenant: string) => {
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [tenant]);
      const { rows } = await client.query('select count(*)::int as n from invoices');
      await client.query('rollback');
      return rows[0].n as number;
    } finally {
      client.release();
    }
  };

  it('hides rows from other tenants', async () => {
    expect(await count(TENANT)).toBeGreaterThan(0);
    expect(await count('00000000-0000-4000-8000-0000000000ff')).toBe(0);
  });
});

const asRole = async (role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'ACCOUNTANT' | 'VIEWER') => {
  const agent = request.agent(app.getHttpServer());
  const res = await signUp(agent as never);
  await admin.query('update memberships set role = $1 where user_id = $2', [role, res.body.user.id]);
  return { agent, me: res.body };
};

const events = async (tenant: string, action: string) =>
  (await admin.query('select * from audit_events where tenant_id = $1 and action = $2 order by created_at', [tenant, action])).rows;

describe('security: configuration', () => {
  const valid = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgres://a:b@localhost:5433/x',
    APP_DATABASE_URL: 'postgres://a:b@localhost:5433/x',
    AUTH_DATABASE_URL: 'postgres://a:b@localhost:5433/x',
    WEB_URL: 'http://localhost:3100',
    INTERNAL_API_TOKEN: 'x'.repeat(32),
    SMTP_URL: 'smtp://mail.example.com:587',
    MAIL_FROM: 'Tabaa <no-reply@example.com>',
    MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  };

  it('refuses to boot when required variables are missing', () => {
    expect(() => parseEnv({})).toThrow(/NODE_ENV[\s\S]*INTERNAL_API_TOKEN/);
    expect(parseEnv(valid).port).toBe(4100);
    for (const key of Object.keys(valid)) {
      expect(() => parseEnv({ ...valid, [key]: undefined })).toThrow(key);
    }
  });

  it('refuses production with localhost SMTP or without Redis', () => {
    const prod = { ...valid, NODE_ENV: 'production', REDIS_URL: 'redis://redis.example.com:6379' };
    expect(() => parseEnv(prod)).not.toThrow();
    expect(() => parseEnv({ ...prod, SMTP_URL: 'smtp://localhost:1125' })).toThrow(/SMTP_URL/);
    expect(() => parseEnv({ ...prod, REDIS_URL: undefined })).toThrow(/REDIS_URL/);
    expect(() => parseEnv({ ...valid, MFA_ENCRYPTION_KEY: 'short' })).toThrow(/MFA_ENCRYPTION_KEY/);
    expect(parseEnv({ ...valid, REDIS_URL: undefined }).redisUrl).toBeUndefined();
  });

  it('is secure unless explicitly relaxed', () => {
    expect(policy.cookieSecure('production')).toBe(true);
    expect(policy.cookieSecure('development')).toBe(false);
    expect(policy.scryptLogN('production')).toBe(17);
    expect(policy.scryptLogN('development')).toBe(17);
    expect(policy.scryptLogN('test')).toBeLessThan(17);
  });

  it('runs against a *_test database', () => {
    expect(new URL(env.adminUrl).pathname).toMatch(/_test$/);
    expect(new URL(env.appUrl).pathname).toMatch(/_test$/);
  });

  it('keeps passwords out of migrations while the roles can log in', async () => {
    for (const dir of readdirSync('./drizzle', { withFileTypes: true }).filter((d) => d.isDirectory())) {
      const sql = readFileSync(`./drizzle/${dir.name}/migration.sql`, 'utf8');
      expect(sql).not.toMatch(/PASSWORD\s+'/i);
    }
    const auth = new Pool({ connectionString: env.authUrl });
    expect((await auth.query('select 1 as ok')).rows[0].ok).toBe(1);
    expect((await appPool.query('select 1 as ok')).rows[0].ok).toBe(1);
    await auth.end();
  });

  it('refuses to seed outside development', () => {
    const run = () =>
      execFileSync('pnpm', ['exec', 'tsx', 'src/seed.ts'], {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          SMTP_URL: 'smtp://mail.example.com:587',
          REDIS_URL: 'redis://redis.example.com:6379',
          // Production rejects the public example secrets before the seed guard is reached.
          INTERNAL_API_TOKEN: 'x'.repeat(32),
          MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
          APP_DATABASE_URL: process.env.APP_DATABASE_URL!.replace('change-me', 'ci'),
          AUTH_DATABASE_URL: process.env.AUTH_DATABASE_URL!.replace('change-me', 'ci'),
        },
        stdio: 'pipe',
      });
    expect(run).toThrow(/Refusing to run/);
  });
});

describe('security: http', () => {
  it('sets security headers and no-store', async () => {
    const res = await anon.get('/v1/me');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cross-origin-resource-policy']).toBeTruthy();
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['strict-transport-security']).toBeTruthy();
  });

  it('honours X-Client-IP only with the internal token', async () => {
    const email = uniqueEmail('ip');
    const res = await signUp(anon, email);
    const tenant = res.body.tenant.id;
    await anon.post('/v1/auth/sign-in').set('X-Client-IP', '203.0.113.9').send({ email, password: PASSWORD }).expect(200);
    await anon
      .post('/v1/auth/sign-in')
      .set('X-Client-IP', '203.0.113.10')
      .set('X-Internal-Token', 'wrong-token-wrong-token')
      .send({ email, password: PASSWORD })
      .expect(200);
    await anon
      .post('/v1/auth/sign-in')
      .set('X-Client-IP', '203.0.113.11')
      .set('X-Internal-Token', env.internalToken)
      .send({ email, password: PASSWORD })
      .expect(200);
    const ips = (await events(tenant, 'auth.sign_in')).map((e) => e.ip);
    expect(ips).toHaveLength(3);
    expect(ips[0]).not.toBe('203.0.113.9');
    expect(ips[1]).not.toBe('203.0.113.10');
    expect(ips[2]).toBe('203.0.113.11');
  });

  it('returns no database text in errors', async () => {
    const inv = (await issue((await draft()).id).expect(200)).body;
    const res = await http.delete(`/v1/invoices/${inv.id}`).expect(409);
    const bad = await http.get('/v1/invoices/not-a-uuid').expect(404);
    for (const body of [res.body, bad.body]) {
      expect(JSON.stringify(body)).not.toMatch(/violates|constraint|select |insert |syntax|relation|facture_/i);
    }
  });
});

describe('security: sessions', () => {
  it('expires idle sessions after 8 hours', async () => {
    const agent = request.agent(app.getHttpServer());
    const res = await signUp(agent as never);
    await agent.get('/v1/me').expect(200);
    await admin.query("update sessions set last_active_at = now() - interval '9 hours' where user_id = $1", [res.body.user.id]);
    await agent.get('/v1/me').expect(401);
  });

  it('signs out everywhere', async () => {
    const email = uniqueEmail('all');
    const first = request.agent(app.getHttpServer());
    await signUp(first as never, email);
    const second = request.agent(app.getHttpServer());
    await second.post('/v1/auth/sign-in').send({ email, password: PASSWORD }).expect(200);
    await first.get('/v1/me').expect(200);
    await second.get('/v1/me').expect(200);
    await second.post('/v1/auth/sign-out-all').expect(204);
    await first.get('/v1/me').expect(401);
    await second.get('/v1/me').expect(401);
    await anon.post('/v1/auth/sign-out-all').expect(401);
  });
});

describe('security: roles', () => {
  it('restricts destructive routes to OWNER and ADMIN', async () => {
    const member = await asRole('MEMBER');
    const party = (await member.agent.post('/v1/parties').send(customerBody).expect(201)).body;
    const none = '00000000-0000-4000-8000-000000000000';
    for (const call of [
      () => member.agent.put('/v1/company').send(company),
      () => member.agent.delete(`/v1/parties/${party.id}`),
      () => member.agent.delete(`/v1/items/${none}`),
      () => member.agent.delete(`/v1/invoices/${none}`),
      () => member.agent.delete(`/v1/payments/${none}`),
      () => member.agent.get('/v1/audit-events'),
      () => member.agent.get('/v1/export'),
    ]) {
      const res = await call();
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    }
    expect((await events(member.me.tenant.id, 'auth.forbidden')).length).toBeGreaterThanOrEqual(7);

    const owner = await asRole('OWNER');
    await owner.agent.put('/v1/company').send(company).expect(200);
    const p = (await owner.agent.post('/v1/parties').send(customerBody).expect(201)).body;
    await owner.agent.delete(`/v1/parties/${p.id}`).expect(204);
  });

  it('lets ADMIN audit but not export, and OWNER export', async () => {
    const admin2 = await asRole('ADMIN');
    await admin2.agent.get('/v1/audit-events').expect(200);
    await admin2.agent.get('/v1/export').expect(403);
    const owner = await asRole('OWNER');
    await owner.agent.put('/v1/company').send(company).expect(200);
    const party = (await owner.agent.post('/v1/parties').send(customerBody).expect(201)).body;
    const inv = (await owner.agent.post('/v1/invoices').send({ customerId: party.id, issueDate: '2026-03-10', lines: [line] }).expect(201)).body;
    const out = (await owner.agent.get('/v1/export').expect(200)).body;
    expect(out.company.name).toBe(company.name);
    expect(out.parties).toHaveLength(1);
    expect(out.invoices.map((i: { id: string }) => i.id)).toEqual([inv.id]);
    expect(Array.isArray(out.payments)).toBe(true);
    expect((await events(owner.me.tenant.id, 'tenant.exported')).length).toBe(1);
  });
});

describe('security: audit trail', () => {
  it('records authentication and business events', async () => {
    const owner = await asRole('OWNER');
    const tenant = owner.me.tenant.id;
    const email = owner.me.user.email;
    await anon.post('/v1/auth/sign-in').send({ email, password: 'wrong-password-1' }).expect(401);
    await anon.post('/v1/auth/sign-in').send({ email, password: PASSWORD }).expect(200);
    expect(await events(tenant, 'auth.sign_up')).toHaveLength(1);
    expect(await events(tenant, 'auth.sign_in')).toHaveLength(1);
    const failed = await events(tenant, 'auth.sign_in_failed');
    expect(failed).toHaveLength(1);
    expect(failed[0].summary).toBe(email);

    await owner.agent.put('/v1/company').send(company).expect(200);
    await owner.agent.put('/v1/company').send({ ...company, rib: '007780000123400045678999', ice: '002876543000092' }).expect(200);
    const upd = (await events(tenant, 'company.updated'))[0];
    expect(upd.summary).toContain('ice');
    expect(upd.summary).toContain('rib');
    expect(upd.summary).not.toMatch(/0078|0028765/);

    const party = (await owner.agent.post('/v1/parties').send(customerBody).expect(201)).body;
    const d = (await owner.agent.post('/v1/invoices').send({ customerId: party.id, issueDate: '2026-03-10', lines: [line] }).expect(201)).body;
    const inv = (await owner.agent.post(`/v1/invoices/${d.id}/issue`).expect(200)).body;
    const issued = (await events(tenant, 'invoice.issued'))[0];
    expect(issued.entity_id).toBe(inv.id);
    expect(issued.summary).toBe(inv.number);
    expect(issued.actor_user_id).toBe(owner.me.user.id);

    const paid = (await owner.agent.post(`/v1/invoices/${inv.id}/payments`).send({ paidOn: '2026-03-15', method: 'CASH', amount: '100.00' }).expect(201)).body;
    expect(await events(tenant, 'payment.recorded')).toHaveLength(1);
    await owner.agent.delete(`/v1/payments/${paid.payments[0].id}`).expect(200);
    const voided = (await events(tenant, 'payment.voided'))[0];
    expect(voided.entity_id).toBe(paid.payments[0].id);

    const list = (await owner.agent.get('/v1/audit-events?limit=5').expect(200)).body;
    expect(list).toHaveLength(5);
    expect(() => AuditEvent.array().parse(list)).not.toThrow();
    expect(list[0].actorName).toBeDefined();
    const older = (await owner.agent.get(`/v1/audit-events?before=${encodeURIComponent(list[4].at)}`).expect(200)).body;
    expect(older.every((e: { at: string }) => e.at < list[4].at)).toBe(true);
    await owner.agent.get('/v1/audit-events?limit=1000').expect(422);
    const dump = JSON.stringify((await admin.query('select * from audit_events where tenant_id = $1', [tenant])).rows);
    expect(dump).not.toContain(PASSWORD);
    expect(dump).not.toContain('wrong-password-1');
  });

  it('is append-only, even for the owner role', async () => {
    const owner = await asRole('OWNER');
    await anon.post('/v1/auth/sign-in').send({ email: owner.me.user.email, password: PASSWORD }).expect(200);
    await expect(admin.query("update audit_events set summary = 'x' where tenant_id = $1", [owner.me.tenant.id])).rejects.toThrow(/ajout seul/);
    await expect(admin.query('delete from audit_events where tenant_id = $1', [owner.me.tenant.id])).rejects.toThrow(/ajout seul/);
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [owner.me.tenant.id]);
      await expect(client.query("update audit_events set summary = 'x'")).rejects.toThrow(/permission denied/);
      await client.query('rollback');
    } finally {
      client.release();
    }
  });
});

describe('security: financial records', () => {
  it('voids payments instead of deleting them', async () => {
    const inv = (await issue((await draft()).id).expect(200)).body;
    const due = Number(inv.totals.amountDue);
    const a = (await http.post(`/v1/invoices/${inv.id}/payments`).send({ paidOn: '2026-03-15', method: 'CASH', amount: '100.00' }).expect(201)).body;
    const b = (await http.post(`/v1/invoices/${inv.id}/payments`).send({ paidOn: '2026-03-16', method: 'CASH', amount: '50.00' }).expect(201)).body;
    expect(b.paidAmount).toBe('150.00');
    const after = (await http.delete(`/v1/payments/${a.payments[0].id}`).expect(200)).body;
    expect(after.paidAmount).toBe('50.00');
    expect(after.payments).toHaveLength(1);
    await http.delete(`/v1/payments/${a.payments[0].id}`).expect(404);
    const row = (await admin.query('select voided_at, voided_by from payments where id = $1', [a.payments[0].id])).rows[0];
    expect(row.voided_at).not.toBeNull();
    expect(row.voided_by).toBe(meUser.id);
    const recent = (await http.get('/v1/dashboard').expect(200)).body.recentPayments;
    expect(recent.some((p: { id: string }) => p.id === a.payments[0].id)).toBe(false);
    const full = (await http.post(`/v1/invoices/${inv.id}/payments`).send({ paidOn: '2026-03-17', method: 'CASH', amount: (due - 50).toFixed(2) }).expect(201)).body;
    expect(full.paymentStatus).toBe('PAID');

    await expect(admin.query('delete from payments where id = $1', [a.payments[0].id])).rejects.toThrow(/annulé/);
    await expect(admin.query("update payments set amount = '1.00' where id = $1", [b.payments[0].id])).rejects.toThrow(/immuable/);
  });
});

describe('record integrity', () => {
  it('freezes the seller at issuance', async () => {
    const owner = await asRole('OWNER');
    await owner.agent.put('/v1/company').send(company).expect(200);
    const party = (await owner.agent.post('/v1/parties').send(customerBody).expect(201)).body;
    const make = async () =>
      (await owner.agent.post('/v1/invoices').send({ customerId: party.id, issueDate: '2026-03-10', lines: [line] }).expect(201)).body;
    const inv = (await owner.agent.post(`/v1/invoices/${(await make()).id}/issue`).expect(200)).body;
    expect(inv.seller.name).toBe(company.name);

    await owner.agent.put('/v1/company').send({ ...company, name: 'Nouvelle Raison Sociale', rib: '007780000123400045678999' }).expect(200);
    const again = (await owner.agent.get(`/v1/invoices/${inv.id}`).expect(200)).body;
    expect(again.seller.name).toBe(company.name);
    expect(again.seller.rib).toBe(company.rib);
    const ubl = (await owner.agent.get(`/v1/invoices/${inv.id}/ubl`).expect(200)).text;
    expect(ubl).toContain(company.name);
    expect(ubl).not.toContain('Nouvelle Raison Sociale');
    expect(ubl).not.toContain('007780000123400045678999');

    const fresh = await make();
    expect(fresh.seller.name).toBe('Nouvelle Raison Sociale');
  });

  it('rejects out-of-bounds bodies', async () => {
    const tooLong = await http.post('/v1/invoices').send({ customerId, issueDate: '2026-03-10', notes: 'x'.repeat(2001), lines: [line] });
    expect(tooLong.status).toBe(422);
    const manyLines = await http.post('/v1/invoices').send({ customerId, issueDate: '2026-03-10', lines: Array(201).fill(line) });
    expect(manyLines.status).toBe(422);
  });
});

describe('row-level security guard', () => {
  it('forces RLS with a policy on every table that has a tenant_id', async () => {
    const { rows } = await admin.query(`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity,
        (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
      where c.relkind = 'r'`);
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const r of rows) {
      expect({ table: r.relname, rls: r.relrowsecurity, forced: r.relforcerowsecurity, policies: r.policies > 0 }).toEqual({
        table: r.relname,
        rls: true,
        forced: true,
        policies: true,
      });
    }
  });
});

describe('invoice PDFs', () => {
  const put = (agent: ReturnType<typeof request>, id: string, body: Buffer | string, token = true, type = 'application/pdf') => {
    let r = agent.put(`/v1/invoices/${id}/pdf`).set('Content-Type', type);
    if (token) r = r.set('X-Internal-Token', env.internalToken);
    return r.send(body);
  };
  const issuedIn = async (agent: ReturnType<typeof request>) => {
    await agent.put('/v1/company').send(company).expect(200);
    const party = (await agent.post('/v1/parties').send(customerBody).expect(201)).body;
    const d = (await agent.post('/v1/invoices').send({ customerId: party.id, issueDate: '2026-03-10', lines: [line] }).expect(201)).body;
    return { draft: d, issued: (await agent.post(`/v1/invoices/${d.id}/issue`).expect(200)).body };
  };

  it('guards the store: token, state, content type, signature and size', async () => {
    const owner = request.agent(app.getHttpServer());
    await signUp(owner as never);
    const { draft: d, issued } = await issuedIn(owner as never);
    const second = (await owner.post('/v1/invoices').send({ customerId: d.customerId, issueDate: '2026-03-10', lines: [line] }).expect(201)).body;

    expect((await put(owner as never, issued.id, pdfBytes(), false)).body.code).toBe('FORBIDDEN');
    await put(owner as never, issued.id, pdfBytes(), false).expect(403);
    await put(anon, issued.id, pdfBytes()).expect(401);
    await put(owner as never, second.id, pdfBytes()).expect(409);
    await put(owner as never, issued.id, Buffer.from('not a pdf at all')).expect(422);
    // A header and trailer with nothing in between is not a document: it must not become the permanent file.
    await put(owner as never, issued.id, Buffer.from('%PDF-1.4\n%%EOF\n')).expect(422);
    await put(owner as never, issued.id, '{"a":1}', true, 'application/json').expect(415);
    await put(owner as never, issued.id, Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(5 * 1024 * 1024)])).expect(413);
    await put(owner as never, '00000000-0000-4000-8000-000000000000', pdfBytes()).expect(404);
    await owner.get(`/v1/invoices/${issued.id}/pdf`).expect(404).expect((r) => expect(r.body.code).toBe('PDF_NOT_GENERATED'));
    await owner.get(`/v1/invoices/${second.id}/pdf`).expect(409);
  });

  it('stores once, serves identical bytes with the hash as ETag, and audits it', async () => {
    const owner = request.agent(app.getHttpServer());
    const me = (await signUp(owner as never)).body;
    const { issued } = await issuedIn(owner as never);
    const bytes = pdfBytes('first');
    await put(owner as never, issued.id, bytes).expect(204);
    const sha = createHash('sha256').update(bytes).digest('hex');

    const res = await owner.get(`/v1/invoices/${issued.id}/pdf`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(Buffer.compare(res.body, bytes)).toBe(0);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-length']).toBe(String(bytes.length));
    expect(res.headers.etag).toBe(`"${sha}"`);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['content-disposition']).toBe(`attachment; filename="${issued.number}.pdf"`);

    const again = await put(owner as never, issued.id, pdfBytes('second'));
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('PDF_ALREADY_STORED');
    const row = (await admin.query('select sha256, size_bytes, created_by from invoice_pdfs where invoice_id = $1', [issued.id])).rows;
    expect(row).toEqual([{ sha256: sha, size_bytes: bytes.length, created_by: me.user.id }]);
    const ev = await events(me.tenant.id, 'invoice.pdf_stored');
    expect(ev).toHaveLength(1);
    expect(ev[0].summary).toContain(sha);
  });

  it('lets exactly one of two concurrent stores win', async () => {
    const owner = request.agent(app.getHttpServer());
    await signUp(owner as never);
    const { issued } = await issuedIn(owner as never);
    const results = await Promise.all([
      put(owner as never, issued.id, pdfBytes('a')),
      put(owner as never, issued.id, pdfBytes('b')),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([204, 409]);
    expect((await admin.query('select 1 from invoice_pdfs where invoice_id = $1', [issued.id])).rowCount).toBe(1);
  });

  it('isolates tenants and rejects tampering at the database level', async () => {
    const owner = request.agent(app.getHttpServer());
    const me = (await signUp(owner as never)).body;
    const { issued } = await issuedIn(owner as never);
    await put(owner as never, issued.id, pdfBytes()).expect(204);
    await http.get(`/v1/invoices/${issued.id}/pdf`).expect(404);

    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [me.tenant.id]);
      await expect(client.query("update invoice_pdfs set sha256 = 'x'")).rejects.toThrow(/permission denied/);
      await client.query('rollback');
      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [me.tenant.id]);
      await expect(client.query('delete from invoice_pdfs')).rejects.toThrow(/permission denied/);
      await client.query('rollback');
    } finally {
      client.release();
    }
    await expect(admin.query("update invoice_pdfs set sha256 = 'x' where invoice_id = $1", [issued.id])).rejects.toThrow(/immuable/);
    await expect(admin.query('delete from invoice_pdfs where invoice_id = $1', [issued.id])).rejects.toThrow(/immuable/);
  });

  it('lets a VIEWER store (with the token) and download', async () => {
    const owner = request.agent(app.getHttpServer());
    const me = (await signUp(owner as never)).body;
    const { issued } = await issuedIn(owner as never);
    await admin.query("update memberships set role = 'VIEWER' where user_id = $1", [me.user.id]);
    await put(owner as never, issued.id, pdfBytes(), false).expect(403);
    await put(owner as never, issued.id, pdfBytes()).expect(204);
    await owner.get(`/v1/invoices/${issued.id}/pdf`).expect(200);
    await owner.post('/v1/parties').send(customerBody).expect(403);
  });
});

describe('accounts: sign-up and email verification', () => {
  const body = (email: string, extra = {}) => ({ name: 'Nadia', email, password: PASSWORD, companyName: 'Atelier Nadia', ...extra });
  const userCount = async (email: string) =>
    (await admin.query('select count(*)::int as n from users where email = $1', [email.toLowerCase()])).rows[0].n;
  const pendingCount = async (email: string) =>
    (await admin.query('select count(*)::int as n from pending_signups where email = $1', [email.toLowerCase()])).rows[0].n;

  it('answers new and existing emails identically and creates nothing until verification', async () => {
    const fresh = uniqueEmail('fresh');
    const a = await anon.post('/v1/auth/sign-up').send(body(fresh));
    expect(a.status).toBe(202);
    expect(a.headers['set-cookie']).toBeUndefined();
    expect(await userCount(fresh)).toBe(0);
    expect(await pendingCount(fresh)).toBe(1);

    const existing = request.agent(app.getHttpServer());
    const owner = await signUp(existing as never);
    const b = await anon.post('/v1/auth/sign-up').send(body(owner.body.user.email));
    expect(b.status).toBe(202);
    expect(b.body).toEqual(a.body);
    expect(b.headers['set-cookie']).toBeUndefined();
    expect(await pendingCount(owner.body.user.email)).toBe(0);
    const notice = await waitMail(owner.body.user.email, 'existe déjà');
    expect(notice.text).toContain('حساب');
    expect(notice.links.some((l) => l.endsWith('/connexion'))).toBe(true);
  });

  it('sends a bilingual verification mail without remote content', async () => {
    const email = uniqueEmail('mail');
    await anon.post('/v1/auth/sign-up').send(body(email)).expect(202);
    const mail = await waitMail(email, 'Confirmez');
    expect(mail.html).toContain('dir="rtl"');
    expect(mail.html).not.toMatch(/<img|<script|src=/i);
    expect(mail.text).toContain('Confirmer mon adresse');
    expect(mail.text).toContain('تأكيد');
    expect(mail.links[0]).toContain('/verification?token=');
  });

  it('verifies once, signs in, and a second request replaces the pending one', async () => {
    const email = uniqueEmail('verify');
    await anon.post('/v1/auth/sign-up').send(body(email)).expect(202);
    const first = tokenOf(await waitMail(email, 'Confirmez'));
    transport.clear();
    await anon.post('/v1/auth/sign-up').send(body(email, { name: 'Autre' })).expect(202);
    const second = tokenOf(await waitMail(email, 'Confirmez'));
    expect(second).not.toBe(first);
    expect(await pendingCount(email)).toBe(1);
    await anon.post('/v1/auth/verify-email').send({ token: first }).expect(422);

    const agent = request.agent(app.getHttpServer());
    const ok = await agent.post('/v1/auth/verify-email').send({ token: second }).expect(201);
    tenantIds.push(ok.body.tenant.id);
    expect(ok.body).toMatchObject({ role: 'OWNER', mfaEnabled: false, user: { name: 'Autre', email } });
    expect((ok.headers['set-cookie'] as unknown as string[]).join(';')).toContain('tabaa_session=');
    await agent.get('/v1/me').expect(200);
    const again = await anon.post('/v1/auth/verify-email').send({ token: second });
    expect(again.status).toBe(422);
    expect(again.body.code).toBe('INVALID_TOKEN');
    expect(await pendingCount(email)).toBe(0);
  });

  it('rejects expired verification links', async () => {
    const email = uniqueEmail('expired');
    await anon.post('/v1/auth/sign-up').send(body(email)).expect(202);
    const token = tokenOf(await waitMail(email, 'Confirmez'));
    await admin.query("update pending_signups set expires_at = now() - interval '1 minute' where email = $1", [email]);
    await anon.post('/v1/auth/verify-email').send({ token }).expect(422);
  });

  it('does not log tokens when a send fails', async () => {
    const email = uniqueEmail('failing');
    const warnings: string[] = [];
    const spy = vi.spyOn(Logger.prototype, 'warn').mockImplementation((m: unknown) => void warnings.push(String(m)));
    transport.failNext(new Error('smtp down'));
    transport.failNext(new Error('smtp down'));
    transport.failNext(new Error('smtp down'));
    await anon.post('/v1/auth/sign-up').send(body(email)).expect(202);
    for (let i = 0; i < 200 && !warnings.some((w) => w.includes('verifyEmail')); i++) await sleep(50);
    spy.mockRestore();
    const line = warnings.find((w) => w.includes('verifyEmail'))!;
    expect(line).toBeDefined();
    expect(line).not.toContain(email);
    expect(line).not.toMatch(/token=/);
  });
});

describe('accounts: two-factor', () => {
  const enrolled = async () => {
    const agent = request.agent(app.getHttpServer());
    const res = await signUp(agent as never);
    const email = res.body.user.email as string;
    const setup = (await agent.post('/v1/auth/mfa/setup').expect(201)).body;
    expect(setup.otpauthUrl).toMatch(/^otpauth:\/\/totp\/Tabaa:.+issuer=Tabaa/);
    expect(decodeURIComponent(setup.otpauthUrl)).toContain(email);
    return { agent, email, secret: setup.secret as string, tenant: res.body.tenant.id as string };
  };
  const enable = async (u: Awaited<ReturnType<typeof enrolled>>) => {
    await u.agent.post('/v1/auth/mfa/enable').send({ code: '000000' }).expect(401);
    clock.offsetMs -= 30_000;
    const res = await u.agent.post('/v1/auth/mfa/enable').send({ code: totp(u.secret) }).expect(200);
    clock.offsetMs += 30_000;
    return res.body.recoveryCodes as string[];
  };
  const signIn = (u: { email: string }) => {
    const agent = request.agent(app.getHttpServer());
    return { agent, res: agent.post('/v1/auth/sign-in').send({ email: u.email, password: PASSWORD }) };
  };

  it('runs the whole lifecycle', async () => {
    const u = await enrolled();
    expect((await u.agent.get('/v1/me')).body.mfaEnabled).toBe(false);
    const codes = await enable(u);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect((await u.agent.get('/v1/me')).body.mfaEnabled).toBe(true);
    await waitMail(u.email, 'activée');
    await u.agent.post('/v1/auth/mfa/setup').expect(409);

    const stored = (await admin.query('select secret from mfa_authenticators')).rows.map((r) => r.secret);
    expect(stored).not.toContain(u.secret);
    const hashed = (await admin.query('select code_hash from mfa_recovery_codes')).rows.map((r) => r.code_hash);
    expect(hashed.some((h: string) => codes.includes(h))).toBe(false);

    // First step: the password alone yields a challenge, not a session.
    const first = signIn(u);
    const res = await first.res.expect(200);
    expect(res.body).toEqual({ mfaRequired: true });
    const cookies = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cookies).toContain('tabaa_mfa=');
    expect(cookies).toMatch(/tabaa_mfa=[^;]+;[^]*HttpOnly/i);
    expect(cookies).not.toContain('tabaa_session=');
    await first.agent.get('/v1/me').expect(401);
    await first.agent.post('/v1/auth/mfa/verify').send({ code: '000000' }).expect(401);

    // A fresh code (next step) completes it; replaying it on a new challenge fails.
    clock.offsetMs += 30_000;
    const code = totp(u.secret);
    const ok = await first.agent.post('/v1/auth/mfa/verify').send({ code }).expect(200);
    expect(ok.body).toMatchObject({ role: 'OWNER', mfaEnabled: true });
    expect((ok.headers['set-cookie'] as unknown as string[]).join(';')).toContain('tabaa_session=');
    await first.agent.get('/v1/me').expect(200);
    await first.agent.post('/v1/auth/mfa/verify').send({ code }).expect(401);
    const replay = signIn(u);
    await replay.res.expect(200);
    await replay.agent.post('/v1/auth/mfa/verify').send({ code }).expect(401);

    // Recovery codes work once.
    const viaRecovery = signIn(u);
    await viaRecovery.res.expect(200);
    await viaRecovery.agent.post('/v1/auth/mfa/verify').send({ recoveryCode: codes[0] }).expect(200);
    const reuse = signIn(u);
    await reuse.res.expect(200);
    await reuse.agent.post('/v1/auth/mfa/verify').send({ recoveryCode: codes[0] }).expect(401);

    // Regenerating needs the password and a current code, and retires the old codes.
    clock.offsetMs += 30_000;
    await viaRecovery.agent.post('/v1/auth/mfa/recovery-codes').send({ password: 'wrong-password-1', code: totp(u.secret) }).expect(401);
    await viaRecovery.agent.post('/v1/auth/mfa/recovery-codes').send({ password: PASSWORD }).expect(401);
    const fresh = (await viaRecovery.agent.post('/v1/auth/mfa/recovery-codes').send({ password: PASSWORD, code: totp(u.secret) }).expect(200)).body.recoveryCodes;
    expect(fresh).toHaveLength(10);
    const old = signIn(u);
    await old.res.expect(200);
    await old.agent.post('/v1/auth/mfa/verify').send({ recoveryCode: codes[1] }).expect(401);
    const renewed = signIn(u);
    await renewed.res.expect(200);
    await renewed.agent.post('/v1/auth/mfa/verify').send({ recoveryCode: fresh[0] }).expect(200);

    for (const action of ['auth.mfa_enabled', 'auth.mfa_failed', 'auth.mfa_recovery_used', 'auth.mfa_codes_regenerated']) {
      expect((await events(u.tenant, action)).length, action).toBeGreaterThan(0);
    }
    expect((await events(u.tenant, 'auth.reauth_failed')).length).toBeGreaterThan(0);
  });

  it('disables with the password and a current code, and password reset keeps two-factor', async () => {
    const u = await enrolled();
    await enable(u);
    clock.offsetMs += 30_000;
    await u.agent.post('/v1/auth/mfa/disable').send({ password: 'wrong-password-1', code: totp(u.secret) }).expect(401);
    const badCode = await u.agent.post('/v1/auth/mfa/disable').send({ password: PASSWORD, code: '000000' }).expect(401);
    expect(badCode.body.code).toBe('INVALID_CODE');

    await anon.post('/v1/auth/password/forgot').send({ email: u.email }).expect(204);
    const token = tokenOf(await waitMail(u.email, 'Réinitialisation'));
    await anon.post('/v1/auth/password/reset').send({ token, password: 'brand-new-password-1' }).expect(204);
    expect((await anon.post('/v1/auth/sign-in').send({ email: u.email, password: 'brand-new-password-1' }).expect(200)).body).toEqual({
      mfaRequired: true,
    });

    const agent = request.agent(app.getHttpServer());
    const pre = await agent.post('/v1/auth/sign-in').send({ email: u.email, password: 'brand-new-password-1' }).expect(200);
    expect(pre.body.mfaRequired).toBe(true);
    clock.offsetMs += 30_000;
    await agent.post('/v1/auth/mfa/verify').send({ code: totp(u.secret) }).expect(200);
    clock.offsetMs += 30_000;
    await agent.post('/v1/auth/mfa/disable').send({ password: 'brand-new-password-1', code: totp(u.secret) }).expect(204);
    expect((await agent.get('/v1/me')).body.mfaEnabled).toBe(false);
    await waitMail(u.email, 'désactivée');
    const plain = await anon.post('/v1/auth/sign-in').send({ email: u.email, password: 'brand-new-password-1' }).expect(200);
    expect(plain.body.mfaEnabled).toBe(false);
    expect((await events(u.tenant, 'auth.mfa_disabled')).length).toBe(1);
  });

  it('kills the challenge after five failed attempts', async () => {
    const u = await enrolled();
    await enable(u);
    const attempt = signIn(u);
    await attempt.res.expect(200);
    for (let i = 0; i < 5; i++) {
      await attempt.agent.post('/v1/auth/mfa/verify').send({ code: '000000' }).expect(401);
    }
    clock.offsetMs += 30_000;
    await attempt.agent.post('/v1/auth/mfa/verify').send({ code: totp(u.secret) }).expect(401);
    const left = (await admin.query('select count(*)::int as n from mfa_challenges c join users x on x.id = c.user_id where x.email = $1', [u.email])).rows[0].n;
    expect(left).toBe(0);
  });
});

describe('accounts: seeded team and closure', () => {
  const SEED_TENANT = '00000000-0000-4000-8000-0000000000e3';

  it('seeds a MEMBER and a VIEWER with the expected permissions', async () => {
    execFileSync('pnpm', ['exec', 'tsx', 'src/seed.ts'], {
      env: { ...process.env, NODE_ENV: 'development', DEV_TENANT_ID: SEED_TENANT },
      stdio: 'pipe',
      timeout: 110_000,
    });
    tenantIds.push(SEED_TENANT, `${SEED_TENANT.slice(0, -4)}f002`);
    const login = async (email: string) => {
      const agent = request.agent(app.getHttpServer());
      const res = await agent.post('/v1/auth/sign-in').send({ email, password: 'tabaa-demo-2026' }).expect(200);
      return { agent, me: res.body };
    };
    const owner = await login('demo@tabaa.ma');
    const member = await login('membre@tabaa.ma');
    const viewer = await login('lecteur@tabaa.ma');
    expect([owner.me.role, member.me.role, viewer.me.role]).toEqual(['OWNER', 'MEMBER', 'VIEWER']);
    expect(owner.me.tenant.id).toBe(SEED_TENANT);
    await member.agent.get('/v1/dashboard').expect(200);
    await member.agent.post('/v1/parties').send({ ...customerBody, name: 'Créé par le membre' }).expect(201);
    await member.agent.put('/v1/company').send(company).expect(403);
    await member.agent.get('/v1/audit-events').expect(403);
    await member.agent.post('/v1/tenant/close').send({ password: 'tabaa-demo-2026', confirmName: 'x' }).expect(403);
    await viewer.agent.get('/v1/invoices').expect(200);
    await viewer.agent.post('/v1/parties').send(customerBody).expect(403);
    await owner.agent.post('/v1/tenant/close').send({ password: 'wrong-password-1', confirmName: owner.me.tenant.name }).expect(401);

    const accountant = await login('comptable@tabaa.ma');
    expect(accountant.me.role).toBe('ACCOUNTANT');
    expect(accountant.me.user.name).toBe('Karim Tazi');
    expect(accountant.me.memberships.map((m: { tenantName: string; role: string }) => [m.tenantName, m.role]).sort()).toEqual([
      ['Atelier Zellige Fès SARL', 'ACCOUNTANT'],
      ['Maghreb Digital Services', 'ACCOUNTANT'],
    ]);
    expect(owner.me.memberships.map((m: { role: string }) => m.role)).toEqual(['OWNER', 'OWNER']);
    await accountant.agent.get('/v1/export').expect(200);
    await accountant.agent.post('/v1/parties').send(customerBody).expect(403);
    const fes = owner.me.memberships.find((m: { tenantName: string }) => m.tenantName.startsWith('Atelier')).tenantId;
    await owner.agent.post('/v1/auth/switch-tenant').send({ tenantId: fes }).expect(200);
    expect((await owner.agent.get('/v1/parties?kind=CUSTOMER').expect(200)).body).toHaveLength(3);
    expect((await owner.agent.get('/v1/purchases').expect(200)).body.total).toBe(3);
    expect((await owner.agent.get('/v1/invoices').expect(200)).body).toHaveLength(5);
  }, 120_000);
});

describe('accounts: closing a workspace', () => {
  it('rejects bad confirmation, forbids MEMBER, then closes and retains', async () => {
    const owner = request.agent(app.getHttpServer());
    const res = await signUp(owner as never);
    const tenant = res.body.tenant.id as string;
    await owner.put('/v1/company').send(company).expect(200);
    const used = (await owner.post('/v1/parties').send(customerBody).expect(201)).body;
    const unused = (await owner.post('/v1/parties').send({ ...customerBody, name: 'Jamais facturé' }).expect(201)).body;
    await owner.post('/v1/items').send({ name: 'Article', unitPrice: '10', vatRate: '20' }).expect(201);
    const mk = async (date: string) =>
      (await owner.post('/v1/invoices').send({ customerId: used.id, issueDate: date, lines: [line] }).expect(201)).body;
    const issued = (await owner.post(`/v1/invoices/${(await mk('2026-03-10')).id}/issue`).expect(200)).body;
    await owner.put(`/v1/invoices/${issued.id}/pdf`).set('Content-Type', 'application/pdf').set('X-Internal-Token', env.internalToken).send(pdfBytes('closure')).expect(204);
    await mk('2026-03-11');
    await anon.post('/v1/auth/sign-in').send({ email: res.body.user.email, password: 'wrong-password-1' }).expect(401);

    const auth = app.get(AuthService, { strict: false });
    const memberEmail = uniqueEmail('member');
    await auth.addMember({ name: 'Collègue', email: memberEmail, passwordHash: await auth.hashPassword(PASSWORD), tenantId: tenant, role: 'MEMBER' });
    const member = request.agent(app.getHttpServer());
    await member.post('/v1/auth/sign-in').send({ email: memberEmail, password: PASSWORD }).expect(200);
    await member.post('/v1/tenant/close').send({ password: PASSWORD, confirmName: 'Société Test' }).expect(403);

    const url = '/v1/tenant/close';
    await owner.post(url).send({ password: 'wrong-password-1', confirmName: 'Société Test' }).expect(401);
    const badName = await owner.post(url).send({ password: PASSWORD, confirmName: 'société test' }).expect(422);
    expect(badName.body.issues[0].path).toBe('confirmName');

    await owner.post(url).send({ password: PASSWORD, confirmName: 'Société Test' }).expect(204);

    const generic = await anon.post('/v1/auth/sign-in').send({ email: res.body.user.email, password: PASSWORD }).expect(401);
    expect(generic.body.code).toBe('INVALID_CREDENTIALS');
    await owner.get('/v1/me').expect(401);
    await member.get('/v1/me').expect(401);
    const q = async (sql: string, params: unknown[] = [tenant]) => (await admin.query(sql, params)).rows;
    expect(await q('select id from users where email = any($1)', [[res.body.user.email, memberEmail]])).toHaveLength(0);
    expect(await q("select id from invoices where tenant_id = $1 and state = 'DRAFT'")).toHaveLength(0);
    expect(await q('select id from items where tenant_id = $1')).toHaveLength(0);
    const parties = (await q('select id from parties where tenant_id = $1')).map((r) => r.id);
    expect(parties).toContain(used.id);
    expect(parties).not.toContain(unused.id);
    const kept = await q("select id, number, retain_until::text as r from invoices where tenant_id = $1 and state = 'ISSUED'");
    expect(kept).toHaveLength(1);
    expect(kept[0].number).toBe(issued.number);
    expect(kept[0].r).toBe('2036-12-31');
    expect(await q('select id from invoice_pdfs where tenant_id = $1')).toHaveLength(1);
    const log = await q('select action, actor_name, actor_user_id, summary from audit_events where tenant_id = $1');
    expect(log.length).toBeGreaterThan(5);
    expect(log.every((e) => e.actor_user_id === null && (e.actor_name === null || e.actor_name === 'Utilisateur supprimé'))).toBe(true);
    expect(log.some((e) => e.action === 'tenant.closed')).toBe(true);
    expect(log.filter((e) => e.action === 'auth.sign_in_failed').every((e) => e.summary === null)).toBe(true);
    const closed = (await q('select closed_at from tenants where id = $1'))[0];
    expect(closed.closed_at).not.toBeNull();
    for (const email of [res.body.user.email, memberEmail]) await waitMail(email, 'fermé');

    // The business role can still read nothing of it through the API, and cannot delete the kept rows.
    await expect(admin.query('delete from invoices where tenant_id = $1', [tenant])).rejects.toThrow(/immuable/);
    await expect(admin.query('delete from audit_events where tenant_id = $1', [tenant])).rejects.toThrow(/ajout seul/);
  });

  it('purges expired rows and, after the retention date, the closed workspace', async () => {
    const closed = (await admin.query('select id from tenants where closed_at is not null and id <> $1', ['00000000-0000-4000-8000-0000000000e3'])).rows[0].id as string;
    tenantIds.push(closed);
    const retention = app.get(RetentionService, { strict: false });

    const email = uniqueEmail('stale');
    await anon.post('/v1/auth/sign-up').send({ name: 'Stale', email, password: PASSWORD, companyName: 'Stale' }).expect(202);
    await admin.query("update pending_signups set expires_at = now() - interval '2 days' where email = $1", [email]);
    await retention.run(new Date('2030-06-01T03:00:00Z'));
    expect((await admin.query('select 1 from pending_signups where email = $1', [email])).rowCount).toBe(0);
    expect((await admin.query('select 1 from invoices where tenant_id = $1', [closed])).rowCount).toBe(1);
    expect((await admin.query('select 1 from audit_events where tenant_id = $1', [closed])).rowCount).toBeGreaterThan(0);

    expect((await retention.run(new Date('2037-01-02T03:00:00Z'))).tenants).toBeGreaterThanOrEqual(1);
    for (const table of ['invoices', 'invoice_pdfs', 'payments', 'audit_events', 'parties', 'companies']) {
      expect((await admin.query(`select 1 from ${table} where tenant_id = $1`, [closed])).rowCount, table).toBe(0);
    }
    expect((await admin.query('select 1 from tenants where id = $1', [closed])).rowCount).toBe(0);
  });
});

const ownerWithCompany = async (companyOverrides: Record<string, unknown> = {}) => {
  const agent = request.agent(app.getHttpServer());
  const me = (await signUp(agent as never)).body;
  // Account throttling keys on any body.email, so each company gets its own address.
  const email = uniqueEmail('compta');
  await agent.put('/v1/company').send({ ...company, email, bankName: 'Attijariwafa bank', ...companyOverrides }).expect(200);
  return { agent, me, companyEmail: email };
};

describe('sending invoices by email', () => {
  const put = (agent: ReturnType<typeof request>, id: string) =>
    agent.put(`/v1/invoices/${id}/pdf`).set('Content-Type', 'application/pdf').set('X-Internal-Token', env.internalToken).send(pdfBytes(id));

  const setup = async (opts: { pdf?: boolean; language?: string } = {}) => {
    const o = await ownerWithCompany({ invoiceLanguage: opts.language ?? 'fr' });
    const party = (await o.agent.post('/v1/parties').send({ ...customerBody, email: 'Client@Example.test' }).expect(201)).body;
    const d = (await o.agent.post('/v1/invoices').send({ customerId: party.id, issueDate: '2026-03-10', lines: [line], dueDate: '2026-04-10' }).expect(201)).body;
    const issued = (await o.agent.post(`/v1/invoices/${d.id}/issue`).expect(200)).body;
    if (opts.pdf !== false) await put(o.agent as never, issued.id).expect(204);
    return { ...o, party, draft: d, issued };
  };
  const payload = (over: Record<string, unknown> = {}) => ({ kind: 'INVOICE', to: ['client@example.test'], subject: 'Votre facture', message: 'Bonjour, voici la facture.', attachUbl: false, ...over });

  it('prefills the dialog in the invoice language', async () => {
    const s = await setup();
    const p = (await s.agent.get(`/v1/invoices/${s.issued.id}/send-preview`).expect(200)).body;
    expect(p.to).toEqual(['client@example.test']);
    expect(p.subject).toContain(s.issued.number);
    for (const part of [s.issued.number, '2 400,00 MAD', '10/04/2026', 'virement bancaire', '007 780 0001234000456789 12', 'Attijariwafa bank']) expect(p.message).toContain(part);
    expect(p.message).not.toMatch(/[؀-ۿ]/);

    const reminder = (await s.agent.get(`/v1/invoices/${s.issued.id}/send-preview?kind=REMINDER`).expect(200)).body;
    expect(reminder.subject).toMatch(/Rappel/);
    expect(reminder.message).toMatch(/2 400,00 MAD/);
    expect(reminder.message).toMatch(/\d+ jours? de retard/);

    const bilingual = await setup({ language: 'fr-ar' });
    const b = (await bilingual.agent.get(`/v1/invoices/${bilingual.issued.id}/send-preview`).expect(200)).body;
    expect(b.message).toMatch(/Bonjour/);
    expect(b.message).toMatch(/[؀-ۿ]/);
    await s.agent.get(`/v1/invoices/${s.issued.id}/send-preview?kind=NOPE`).expect(422);
  });

  it('sends with the PDF, optional UBL and Reply-To, and records it', async () => {
    const s = await setup();
    transport.clear();
    const res = await s.agent
      .post(`/v1/invoices/${s.issued.id}/send`)
      .send(payload({ to: ['Client@Example.test', 'client@example.test'], cc: ['compta@example.test', 'client@example.test'], attachUbl: true }))
      .expect(200);
    expect(res.body.deliveries).toHaveLength(1);
    expect(res.body.deliveries[0]).toMatchObject({ kind: 'INVOICE', to: ['client@example.test'], cc: ['compta@example.test'], subject: 'Votre facture', sentByName: 'Test User' });
    const mail = transport.mails.at(-1)!;
    expect(mail.to.map((a) => a.address)).toEqual(['client@example.test']);
    expect(mail.cc.map((a) => a.address)).toEqual(['compta@example.test']);
    expect(mail.from.address).toBe('no-reply@tabaa.local');
    expect(mail.from.name).toBe('Test Société SARL via Tabaa');
    expect(mail.raw).toMatch(new RegExp(`Reply-To:.*${s.companyEmail.replace('.', '\\.')}`, 'i'));
    const pdf = mail.attachment(`${s.issued.number}.pdf`);
    expect(pdf.contentType).toBe('application/pdf');
    expect(Buffer.from(pdf.content).subarray(0, 5).toString()).toBe('%PDF-');
    const xml = mail.attachment(`${s.issued.number}.xml`);
    expect(xml.contentType).toContain('xml');
    expect(Buffer.from(xml.content).toString()).toContain('<Invoice');
    expect(mail.html).not.toMatch(/<img|https?:\/\//);

    const again = (await s.agent.post(`/v1/invoices/${s.issued.id}/send`).send(payload({ kind: 'REMINDER', subject: 'Rappel' })).expect(200)).body;
    expect(again.deliveries.map((d: { kind: string }) => d.kind)).toEqual(['REMINDER', 'INVOICE']);
    expect(transport.mails.at(-1)!.attachments.map((a) => a.filename)).toEqual([`${s.issued.number}.pdf`]);
    const list = (await s.agent.get('/v1/invoices').expect(200)).body;
    expect(list[0].lastSentAt).toBe(again.deliveries[0].sentAt);
    const audit = await events(s.me.tenant.id, 'invoice.sent');
    expect(audit).toHaveLength(1);
    expect(audit[0].summary).toBe('2 destinataires');
    expect(audit[0].summary).not.toContain('Bonjour');
    expect((await events(s.me.tenant.id, 'invoice.reminder_sent')).length).toBe(1);
    expect((await s.agent.get(`/v1/invoices/${s.draft.id}`).expect(200)).body.deliveries).toHaveLength(2);
    await expect(admin.query('delete from invoice_deliveries')).rejects.toThrow(/immuable/);
    await expect(appPool.query('update invoice_deliveries set subject = $1', ['x'])).rejects.toThrow();
  });

  it('refuses drafts, missing PDFs and pointless reminders', async () => {
    const s = await setup({ pdf: false });
    const d2 = (await s.agent.post('/v1/invoices').send({ customerId: s.party.id, issueDate: '2026-03-10', lines: [line] }).expect(201)).body;
    expect((await s.agent.post(`/v1/invoices/${d2.id}/send`).send(payload()).expect(409)).body.code).toBe('CONFLICT');
    await s.agent.get(`/v1/invoices/${d2.id}/send-preview`).expect(409);
    const noPdf = await s.agent.post(`/v1/invoices/${s.issued.id}/send`).send(payload()).expect(409);
    expect(noPdf.body.code).toBe('PDF_NOT_GENERATED');
    await put(s.agent as never, s.issued.id).expect(204);
    await s.agent.post(`/v1/invoices/${s.issued.id}/payments`).send({ paidOn: '2026-03-20', method: 'TRANSFER', amount: s.issued.totals.amountDue }).expect(201);
    await s.agent.post(`/v1/invoices/${s.issued.id}/send`).send(payload({ kind: 'REMINDER' })).expect(409);
    await s.agent.get(`/v1/invoices/${s.issued.id}/send-preview?kind=REMINDER`).expect(409);
    await s.agent.post(`/v1/invoices/${s.issued.id}/send`).send(payload()).expect(200);
  });

  it('rejects header injection, and the caller cannot set From', async () => {
    const s = await setup();
    transport.clear();
    const bad = await s.agent.post(`/v1/invoices/${s.issued.id}/send`).send(payload({ subject: 'Facture\r\nBcc: evil@example.test' }));
    expect(bad.status).toBe(422);
    expect(bad.body.issues[0].path).toBe('subject');
    await s.agent.post(`/v1/invoices/${s.issued.id}/send`).send(payload({ to: ['a@example.test\r\nBcc: evil@example.test'] })).expect(422);
    const withFrom = await s.agent.post(`/v1/invoices/${s.issued.id}/send`).send({ ...payload(), from: 'evil@example.test', headers: { Bcc: 'evil@example.test' } });
    expect(withFrom.status).toBe(200);
    expect(transport.mails.at(-1)!.from.address).toBe('no-reply@tabaa.local');
    expect(transport.mails.at(-1)!.raw).not.toMatch(/evil@example\.test/);
    const odd = await ownerWithCompany({ name: 'Evil" <x@y.z>\r\nBcc: z@y.z' });
    const party = (await odd.agent.post('/v1/parties').send(customerBody).expect(201)).body;
    const inv = (await odd.agent.post('/v1/invoices').send({ customerId: party.id, issueDate: '2026-03-10', lines: [line] }).expect(201)).body;
    const issued = (await odd.agent.post(`/v1/invoices/${inv.id}/issue`).expect(200)).body;
    await put(odd.agent as never, issued.id).expect(204);
    await odd.agent.post(`/v1/invoices/${issued.id}/send`).send(payload()).expect(200);
    expect(transport.mails.at(-1)!.raw).not.toMatch(/^Bcc:/im);
  });

  it('answers 502 and records nothing when the mail server refuses', async () => {
    const s = await setup();
    transport.failNext(new Error('smtp down'));
    transport.failNext(new Error('smtp down'));
    const res = await s.agent.post(`/v1/invoices/${s.issued.id}/send`).send(payload()).expect(502);
    expect(res.body.code).toBe('MAIL_FAILED');
    expect((await admin.query('select 1 from invoice_deliveries where invoice_id = $1', [s.issued.id])).rowCount).toBe(0);
    expect(await events(s.me.tenant.id, 'invoice.sent')).toHaveLength(0);
    transport.clear();
    await s.agent.post(`/v1/invoices/${s.issued.id}/send`).send(payload()).expect(200);
  });

  it('limits sends per workspace per hour and per day', async () => {
    const s = await setup();
    const fill = (n: number, ago: string) =>
      admin.query(
        `insert into invoice_deliveries (tenant_id, invoice_id, kind, "to", cc, subject, message, attach_ubl, sent_at)
         select $1, $2, 'INVOICE', array['x@example.test'], array[]::text[], 's', 'm', false, now() - $3::interval from generate_series(1, $4)`,
        [s.me.tenant.id, s.issued.id, ago, n],
      );
    await fill(19, '10 minutes');
    await s.agent.post(`/v1/invoices/${s.issued.id}/send`).send(payload()).expect(200);
    const limited = await s.agent.post(`/v1/invoices/${s.issued.id}/send`).send(payload()).expect(429);
    expect(limited.body.code).toBe('SEND_LIMIT');

    const d = await setup();
    await admin.query(
      `insert into invoice_deliveries (tenant_id, invoice_id, kind, "to", cc, subject, message, attach_ubl, sent_at)
       select $1, $2, 'INVOICE', array['x@example.test'], array[]::text[], 's', 'm', false, now() - interval '3 hours' - (g || ' minutes')::interval from generate_series(1, 200) g`,
      [d.me.tenant.id, d.issued.id],
    );
    expect((await d.agent.post(`/v1/invoices/${d.issued.id}/send`).send(payload()).expect(429)).body.code).toBe('SEND_LIMIT');
  });

  it('is closed to VIEWER and ACCOUNTANT and to other workspaces', async () => {
    const s = await setup();
    for (const role of ['VIEWER', 'ACCOUNTANT']) {
      const r = await asRole(role as 'VIEWER');
      await admin.query('update memberships set tenant_id = $1 where user_id = $2', [s.me.tenant.id, r.me.user.id]);
      await admin.query('update sessions set tenant_id = $1 where user_id = $2', [s.me.tenant.id, r.me.user.id]);
      expect((await r.agent.post(`/v1/invoices/${s.issued.id}/send`).send(payload())).status).toBe(403);
      expect((await r.agent.get(`/v1/invoices/${s.issued.id}/send-preview`)).status).toBe(403);
      await r.agent.get(`/v1/invoices/${s.issued.id}`).expect(200);
    }
    const other = await ownerWithCompany();
    await other.agent.post(`/v1/invoices/${s.issued.id}/send`).send(payload()).expect(404);
    await other.agent.get(`/v1/invoices/${s.issued.id}/send-preview`).expect(404);
  });
});

// A workspace with an OWNER and people added through the real invitation flow.
const invite = async (agent: ReturnType<typeof request>, email: string, role: string) => {
  const res = await agent.post('/v1/team/invitations').send({ email, role });
  if (res.status !== 201) return { res, token: '' };
  const mail = await waitMail(email, 'Invitation');
  return { res, token: tokenOf(mail) };
};
const join = async (owner: ReturnType<typeof request>, role: string) => {
  const email = uniqueEmail(role.toLowerCase());
  const { token } = await invite(owner, email, role);
  const agent = request.agent(app.getHttpServer());
  const res = await agent.post('/v1/auth/invitations/accept').send({ token, name: `Nom ${role}`, password: PASSWORD }).expect(200);
  return { agent, me: res.body, email };
};
const workspaceWith = async () => {
  const o = await ownerWithCompany();
  return { ...o, join: (role: string) => join(o.agent as never, role) };
};

describe('team: permissions by role', () => {
  it('applies the permission table to all five roles', async () => {
    const none = '00000000-0000-4000-8000-000000000000';
    const matrix: [string, (a: ReturnType<typeof request>) => Promise<{ status: number }>, string[]][] = [
      ['read', (a) => a.get('/v1/invoices'), ['OWNER', 'ADMIN', 'MEMBER', 'ACCOUNTANT', 'VIEWER']],
      ['create customer', (a) => a.post('/v1/parties').send(customerBody), ['OWNER', 'ADMIN', 'MEMBER']],
      ['send', (a) => a.post(`/v1/invoices/${none}/send`).send({ to: ['a@example.test'], subject: 's' }), ['OWNER', 'ADMIN', 'MEMBER']],
      ['company settings', (a) => a.put('/v1/company').send(company), ['OWNER', 'ADMIN']],
      ['void payment', (a) => a.delete(`/v1/payments/${none}`), ['OWNER', 'ADMIN']],
      ['activity log', (a) => a.get('/v1/audit-events'), ['OWNER', 'ADMIN', 'ACCOUNTANT']],
      ['export', (a) => a.get('/v1/export'), ['OWNER', 'ACCOUNTANT']],
      ['manage team', (a) => a.post('/v1/team/invitations').send({ email: uniqueEmail('p'), role: 'VIEWER' }), ['OWNER', 'ADMIN']],
      ['close workspace', (a) => a.post('/v1/tenant/close').send({ password: 'wrong-password-1', confirmName: 'x' }), ['OWNER']],
      ['store PDF', (a) => a.put(`/v1/invoices/${none}/pdf`).set('Content-Type', 'application/pdf').set('X-Internal-Token', env.internalToken).send(pdfBytes()), ['OWNER', 'ADMIN', 'MEMBER', 'ACCOUNTANT', 'VIEWER']],
      ['read team', (a) => a.get('/v1/team'), ['OWNER', 'ADMIN', 'MEMBER', 'ACCOUNTANT', 'VIEWER']],
    ];
    for (const role of ['OWNER', 'ADMIN', 'MEMBER', 'ACCOUNTANT', 'VIEWER'] as const) {
      const r = await asRole(role);
      for (const [name, call, allowed] of matrix) {
        const status = (await call(r.agent as never)).status;
        expect({ role, name, forbidden: status === 403 }, `${role} ${name} -> ${status}`).toEqual({ role, name, forbidden: !allowed.includes(role) });
      }
    }
  });

  it('shows invitations only to OWNER and ADMIN', async () => {
    const w = await workspaceWith();
    await invite(w.agent as never, uniqueEmail('pending'), 'MEMBER');
    const admin2 = await w.join('ADMIN');
    const acc = await w.join('ACCOUNTANT');
    expect((await w.agent.get('/v1/team').expect(200)).body.invitations).toHaveLength(1);
    expect((await admin2.agent.get('/v1/team').expect(200)).body.invitations).toHaveLength(1);
    const t = (await acc.agent.get('/v1/team').expect(200)).body;
    expect(t.invitations).toEqual([]);
    expect(t.members).toHaveLength(3);
    expect(t.members.filter((m: { isYou: boolean }) => m.isYou)).toHaveLength(1);
  });
});

describe('team: invitations', () => {
  it('invites, previews and accepts as a new user, once', async () => {
    const w = await workspaceWith();
    const email = uniqueEmail('Newbie');
    const { res, token } = await invite(w.agent as never, email, 'MEMBER');
    expect(res.body).toMatchObject({ email: email.toLowerCase(), role: 'MEMBER', invitedByName: 'Test User' });
    const mail = await waitMail(email, 'Invitation');
    expect(mail.html).toContain('Société Test');
    expect(mail.text).toMatch(/[؀-ۿ]/);
    expect(new URL(mail.link('token=')).pathname).toBe('/invitation');
    expect(((await admin.query('select token_hash from invitations where id = $1', [res.body.id])).rows[0].token_hash as string)).not.toContain(token);
    const days = (new Date(res.body.expiresAt).getTime() - new Date(res.body.createdAt).getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(7);

    const preview = (await anon.get(`/v1/auth/invitations/${token}`).expect(200)).body;
    expect(preview).toEqual({ tenantName: 'Société Test', email: email.toLowerCase(), role: 'MEMBER', inviterName: 'Test User', accountExists: false });
    const agent = request.agent(app.getHttpServer());
    await agent.post('/v1/auth/invitations/accept').send({ token }).expect(422);
    await agent.post('/v1/auth/invitations/accept').send({ token, name: 'Nouvelle', password: email }).expect(422);
    const accepted = await agent.post('/v1/auth/invitations/accept').send({ token, name: 'Nouvelle', password: PASSWORD }).expect(200);
    expect(accepted.body).toMatchObject({ role: 'MEMBER', tenant: { id: w.me.tenant.id }, user: { name: 'Nouvelle' } });
    expect(accepted.body.memberships).toHaveLength(1);
    expect((await agent.get('/v1/me').expect(200)).body.tenant.id).toBe(w.me.tenant.id);
    await anon.post('/v1/auth/sign-in').send({ email, password: PASSWORD }).expect(200);
    expect((await anon.get(`/v1/auth/invitations/${token}`)).body.code).toBe('INVALID_TOKEN');
    const reuse = await request.agent(app.getHttpServer()).post('/v1/auth/invitations/accept').send({ token, name: 'X', password: PASSWORD });
    expect([reuse.status, reuse.body.code]).toEqual([404, 'INVALID_TOKEN']);
    expect((await w.agent.get('/v1/team').expect(200)).body.invitations).toEqual([]);
    expect(await events(w.me.tenant.id, 'team.invited')).toHaveLength(1);
    expect(await events(w.me.tenant.id, 'team.joined')).toHaveLength(1);
  });

  it('lets an existing account accept while signed in as that email, and switch', async () => {
    const w = await workspaceWith();
    const guest = await ownerWithCompany();
    await guest.agent.post('/v1/parties').send(customerBody).expect(201);
    const { token } = await invite(w.agent as never, guest.me.user.email, 'ACCOUNTANT');
    expect((await anon.get(`/v1/auth/invitations/${token}`).expect(200)).body.accountExists).toBe(true);

    const stranger = await ownerWithCompany();
    const signedOut = await anon.post('/v1/auth/invitations/accept').send({ token });
    expect([signedOut.status, signedOut.body.code]).toEqual([401, 'SIGN_IN_REQUIRED']);
    const wrong = await stranger.agent.post('/v1/auth/invitations/accept').send({ token });
    expect([wrong.status, wrong.body.code]).toEqual([403, 'WRONG_ACCOUNT']);

    const sessionsBefore = (await admin.query('select count(*)::int n from sessions where user_id = $1', [guest.me.user.id])).rows[0].n;
    const ok = await guest.agent.post('/v1/auth/invitations/accept').send({ token }).expect(200);
    expect(ok.body.tenant.id).toBe(w.me.tenant.id);
    expect(ok.body.role).toBe('ACCOUNTANT');
    expect(ok.body.memberships).toHaveLength(2);
    expect((await admin.query('select count(*)::int n from sessions where user_id = $1', [guest.me.user.id])).rows[0].n).toBe(sessionsBefore);
    expect((await guest.agent.get('/v1/parties').expect(200)).body).toEqual([]);

    const back = await guest.agent.post('/v1/auth/switch-tenant').send({ tenantId: guest.me.tenant.id }).expect(200);
    expect(back.body.role).toBe('OWNER');
    expect((await guest.agent.get('/v1/parties').expect(200)).body).toHaveLength(1);
    await anon.post('/v1/auth/invitations/accept').send({ token }).expect(404);
  });

  it('expires, resends with a new token, and revokes', async () => {
    const w = await workspaceWith();
    const email = uniqueEmail('late');
    const { res, token } = await invite(w.agent as never, email, 'VIEWER');
    await admin.query("update invitations set expires_at = now() - interval '1 minute' where id = $1", [res.body.id]);
    expect((await anon.get(`/v1/auth/invitations/${token}`)).status).toBe(404);
    expect((await anon.post('/v1/auth/invitations/accept').send({ token, name: 'L', password: PASSWORD })).body.code).toBe('INVALID_TOKEN');
    expect((await invite(w.agent as never, email, 'VIEWER')).res.body.code).toBe('ALREADY_INVITED');

    transport.clear();
    const again = await w.agent.post(`/v1/team/invitations/${res.body.id}/resend`).expect(200);
    expect(new Date(again.body.expiresAt).getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    const fresh = tokenOf(await waitMail(email, 'Invitation'));
    expect(fresh).not.toBe(token);
    await anon.get(`/v1/auth/invitations/${token}`).expect(404);
    await anon.get(`/v1/auth/invitations/${fresh}`).expect(200);

    await w.agent.delete(`/v1/team/invitations/${res.body.id}`).expect(204);
    await anon.get(`/v1/auth/invitations/${fresh}`).expect(404);
    await w.agent.delete(`/v1/team/invitations/${res.body.id}`).expect(404);
    expect(await events(w.me.tenant.id, 'team.invitation_revoked')).toHaveLength(1);
    expect((await invite(w.agent as never, email, 'VIEWER')).res.status).toBe(201);
  });

  it('refuses existing members, and caps invitations per day', async () => {
    const w = await workspaceWith();
    const m = await w.join('MEMBER');
    const dup = await invite(w.agent as never, m.email.toUpperCase(), 'VIEWER');
    expect([dup.res.status, dup.res.body.code]).toEqual([409, 'ALREADY_MEMBER']);
    expect((await invite(w.agent as never, w.me.user.email, 'VIEWER')).res.body.code).toBe('ALREADY_MEMBER');
    await admin.query(
      `insert into invitations (tenant_id, email, role, token_hash, expires_at, revoked_at)
       select $1, 'bulk' || g || '@example.test', 'VIEWER', md5(g::text), now() + interval '7 days', now() from generate_series(1, 28) g`,
      [w.me.tenant.id],
    );
    expect((await invite(w.agent as never, uniqueEmail('ok'), 'VIEWER')).res.status).toBe(201);
    const over = await w.agent.post('/v1/team/invitations').send({ email: uniqueEmail('over'), role: 'VIEWER' });
    expect([over.status, over.body.code]).toEqual([429, 'INVITE_LIMIT']);
  });

  it('lets only an OWNER hand out or touch ownership', async () => {
    const w = await workspaceWith();
    const adm = await w.join('ADMIN');
    const mem = await w.join('MEMBER');
    expect((await adm.agent.post('/v1/team/invitations').send({ email: uniqueEmail('o'), role: 'OWNER' })).status).toBe(403);
    expect((await adm.agent.patch(`/v1/team/members/${mem.me.user.id}`).send({ role: 'OWNER' })).status).toBe(403);
    expect((await adm.agent.patch(`/v1/team/members/${w.me.user.id}`).send({ role: 'MEMBER' })).status).toBe(403);
    expect((await adm.agent.delete(`/v1/team/members/${w.me.user.id}`)).status).toBe(403);
    expect((await mem.agent.patch(`/v1/team/members/${mem.me.user.id}`).send({ role: 'ADMIN' })).status).toBe(403);
    const ownerInvite = await w.agent.post('/v1/team/invitations').send({ email: uniqueEmail('o2'), role: 'OWNER' }).expect(201);
    expect((await adm.agent.delete(`/v1/team/invitations/${ownerInvite.body.id}`)).status).toBe(403);

    transport.clear();
    const promoted = await adm.agent.patch(`/v1/team/members/${mem.me.user.id}`).send({ role: 'VIEWER' }).expect(200);
    expect(promoted.body).toMatchObject({ role: 'VIEWER', isYou: false });
    await waitMail(mem.email, 'rôle a changé');
    expect((await mem.agent.get('/v1/me')).body.role).toBe('VIEWER');
    await w.agent.patch(`/v1/team/members/${mem.me.user.id}`).send({ role: 'OWNER' }).expect(200);
    expect((await events(w.me.tenant.id, 'team.role_changed')).length).toBe(2);
    await adm.agent.patch(`/v1/team/members/${w.me.user.id}`).send({ role: 'ADMIN' }).expect(403);
    await w.agent.patch(`/v1/team/members/${w.me.user.id}`).send({ role: 'ADMIN' }).expect(200);
  });

  it('never leaves a workspace without an OWNER, even under concurrent demotions', async () => {
    const w = await workspaceWith();
    const last = await w.agent.patch(`/v1/team/members/${w.me.user.id}`).send({ role: 'ADMIN' });
    expect([last.status, last.body.code]).toEqual([409, 'LAST_OWNER']);
    expect((await w.agent.delete(`/v1/team/members/${w.me.user.id}`)).body.code).toBe('LAST_OWNER');
    const m = await w.join('MEMBER');
    await w.agent.patch(`/v1/team/members/${m.me.user.id}`).send({ role: 'OWNER' }).expect(200);
    for (let i = 0; i < 3; i++) {
      const [a, b] = await Promise.all([
        w.agent.patch(`/v1/team/members/${m.me.user.id}`).send({ role: 'ADMIN' }),
        m.agent.patch(`/v1/team/members/${w.me.user.id}`).send({ role: 'ADMIN' }),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const owners = (await admin.query("select count(*)::int n from memberships where tenant_id = $1 and role = 'OWNER'", [w.me.tenant.id])).rows[0].n;
      expect(owners).toBe(1);
      await admin.query("update memberships set role = 'OWNER' where tenant_id = $1", [w.me.tenant.id]);
    }
    const [x, y] = await Promise.all([
      w.agent.delete(`/v1/team/members/${m.me.user.id}`),
      m.agent.delete(`/v1/team/members/${w.me.user.id}`),
    ]);
    expect([x.status, y.status].sort()).toEqual([204, 409]);
  });
});

describe('team: several workspaces', () => {
  it('removes or lets leave, revoking only that workspace\'s sessions', async () => {
    const a = await workspaceWith();
    const b = await ownerWithCompany();
    const x = await a.join('MEMBER');
    transport.clear();
    const { token } = await invite(b.agent as never, x.email, 'VIEWER');
    await x.agent.post('/v1/auth/invitations/accept').send({ token }).expect(200);
    const onA = request.agent(app.getHttpServer());
    await onA.post('/v1/auth/sign-in').send({ email: x.email, password: PASSWORD }).expect(200);
    await onA.post('/v1/auth/switch-tenant').send({ tenantId: a.me.tenant.id }).expect(200);
    const onB = x.agent;
    expect((await onB.get('/v1/me').expect(200)).body.tenant.id).toBe(b.me.tenant.id);

    transport.clear();
    await a.agent.delete(`/v1/team/members/${x.me.user.id}`).expect(204);
    await waitMail(x.email, 'Accès retiré');
    await onA.get('/v1/me').expect(401);
    expect((await onB.get('/v1/me').expect(200)).body.memberships).toHaveLength(1);
    expect((await admin.query('select 1 from users where id = $1', [x.me.user.id])).rowCount).toBe(1);
    expect((await events(a.me.tenant.id, 'team.member_removed')).length).toBe(1);
    await a.agent.delete(`/v1/team/members/${x.me.user.id}`).expect(404);
  });

  it('lets any role leave on its own', async () => {
    const w = await workspaceWith();
    for (const role of ['ACCOUNTANT', 'VIEWER']) {
      const m = await w.join(role);
      await m.agent.delete(`/v1/team/members/${m.me.user.id}`).expect(204);
      await m.agent.get('/v1/me').expect(401);
    }
    const m = await w.join('MEMBER');
    expect((await m.agent.delete(`/v1/team/members/${w.me.user.id}`)).status).toBe(403);
  });

  it('switches workspace, keeps data apart, and signs in to the last one used', async () => {
    const a = await ownerWithCompany();
    const b = await ownerWithCompany();
    const pa = (await a.agent.post('/v1/parties').send({ ...customerBody, name: 'Client de A' }).expect(201)).body;
    await b.agent.post('/v1/parties').send({ ...customerBody, name: 'Client de B' }).expect(201);
    const { token } = await invite(b.agent as never, a.me.user.email, 'MEMBER');
    await a.agent.post('/v1/auth/invitations/accept').send({ token }).expect(200);
    const names = async () => (await a.agent.get('/v1/parties').expect(200)).body.map((p: { name: string }) => p.name);
    expect(await names()).toEqual(['Client de B']);
    await a.agent.get(`/v1/parties/${pa.id}`).expect(404);
    const me = (await a.agent.post('/v1/auth/switch-tenant').send({ tenantId: a.me.tenant.id }).expect(200)).body;
    expect(me.tenant.id).toBe(a.me.tenant.id);
    expect(await names()).toEqual(['Client de A']);
    await a.agent.get(`/v1/parties/${pa.id}`).expect(200);

    const fresh = (await anon.post('/v1/auth/sign-in').send({ email: a.me.user.email, password: PASSWORD }).expect(200)).body;
    expect(fresh.tenant.id).toBe(a.me.tenant.id);
    await a.agent.post('/v1/auth/switch-tenant').send({ tenantId: b.me.tenant.id }).expect(200);
    expect((await anon.post('/v1/auth/sign-in').send({ email: a.me.user.email, password: PASSWORD }).expect(200)).body.tenant.id).toBe(b.me.tenant.id);
    await admin.query('update memberships set last_used_at = null where user_id = $1', [a.me.user.id]);
    expect((await anon.post('/v1/auth/sign-in').send({ email: a.me.user.email, password: PASSWORD }).expect(200)).body.tenant.id).toBe(a.me.tenant.id);

    const stranger = await ownerWithCompany();
    expect((await a.agent.post('/v1/auth/switch-tenant').send({ tenantId: stranger.me.tenant.id })).status).toBe(403);
    expect((await a.agent.post('/v1/auth/switch-tenant').send({ tenantId: '00000000-0000-4000-8000-000000000000' })).status).toBe(403);
    await anon.post('/v1/auth/switch-tenant').send({ tenantId: a.me.tenant.id }).expect(401);
    expect((await a.agent.get('/v1/me')).body.memberships).toHaveLength(2);
  });

  it('closing a workspace keeps shared accounts and their other membership', async () => {
    const a = await workspaceWith();
    const b = await ownerWithCompany();
    const shared = await a.join('MEMBER');
    const solo = await a.join('VIEWER');
    const { token } = await invite(b.agent as never, shared.email, 'ACCOUNTANT');
    await shared.agent.post('/v1/auth/invitations/accept').send({ token }).expect(200);
    await invite(a.agent as never, uniqueEmail('pending'), 'MEMBER');
    transport.clear();
    await a.agent.post('/v1/tenant/close').send({ password: PASSWORD, confirmName: 'Société Test' }).expect(204);
    await waitMail(shared.email, 'fermé');
    await waitMail(solo.email, 'fermé');
    expect((await admin.query('select 1 from users where id = $1', [shared.me.user.id])).rowCount).toBe(1);
    expect((await admin.query('select 1 from users where id = $1', [solo.me.user.id])).rowCount).toBe(0);
    expect((await admin.query('select tenant_id from memberships where user_id = $1', [shared.me.user.id])).rows).toEqual([{ tenant_id: b.me.tenant.id }]);
    expect((await admin.query('select 1 from invitations where tenant_id = $1', [a.me.tenant.id])).rowCount).toBe(0);
    await solo.agent.get('/v1/me').expect(401);
    expect((await shared.agent.get('/v1/me').expect(200)).body.tenant.id).toBe(b.me.tenant.id);
    const back = (await anon.post('/v1/auth/sign-in').send({ email: shared.email, password: PASSWORD }).expect(200)).body;
    expect(back.tenant.id).toBe(b.me.tenant.id);
    expect(back.memberships).toHaveLength(1);
  });
});

describe('team: tables are protected', () => {
  it('forces RLS with a policy on the new tables', async () => {
    const { rows } = await admin.query(`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity,
        (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
      from pg_class c where c.relname in ('invoice_deliveries', 'invitations')`);
    expect(rows.map((r) => r.relname).sort()).toEqual(['invitations', 'invoice_deliveries']);
    for (const r of rows) expect([r.relrowsecurity, r.relforcerowsecurity, r.policies > 0]).toEqual([true, true, true]);
  });

  it('keeps invitations of another workspace invisible to the business role', async () => {
    const a = await workspaceWith();
    const b = await workspaceWith();
    const { res } = await invite(a.agent as never, uniqueEmail('hidden'), 'MEMBER');
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [b.me.tenant.id]);
      expect((await client.query('select 1 from invitations where id = $1', [res.body.id])).rowCount).toBe(0);
      await client.query('rollback');
    } finally {
      client.release();
    }
  });
});

describe('bank import and reconciliation', () => {
  const none = '00000000-0000-4000-8000-000000000000';
  const importBody = (lines: { date?: string; label: string; amount: string; reference?: string }[], fileName = 'releve.csv') => ({
    fileName,
    accountLabel: 'Compte 1',
    lines: lines.map((l) => ({ date: '2026-11-10', ...l })),
  });
  const bankSetup = async () => {
    const o = await ownerWithCompany();
    const customer = async (name: string) =>
      (await o.agent.post('/v1/parties').send({ ...customerBody, name }).expect(201)).body.id as string;
    const invoiceFor = async (customerId: string, qty = '1', issue = true) => {
      const d = (await o.agent.post('/v1/invoices').send({ customerId, issueDate: '2026-03-10', lines: [{ ...line, quantity: qty }] }).expect(201)).body;
      return issue ? (await o.agent.post(`/v1/invoices/${d.id}/issue`).expect(200)).body : d;
    };
    const imp = async (lines: Parameters<typeof importBody>[0], fileName?: string) =>
      (await o.agent.post('/v1/bank/imports').send(importBody(lines, fileName)).expect(201)).body;
    const lines = async (query = '') => (await o.agent.get(`/v1/bank/transactions${query}`).expect(200)).body;
    const lineOf = async (label: string) => (await lines()).items.find((l: { label: string }) => l.label === label);
    return { ...o, customer, invoiceFor, imp, lines, lineOf };
  };
  const invoiceOf = async (agent: ReturnType<typeof request>, id: string) => (await agent.get(`/v1/invoices/${id}`).expect(200)).body;

  it('imports lines, keeps duplicates inside a file and skips those of earlier imports', async () => {
    const b = await bankSetup();
    const first = await b.imp(
      [
        { label: 'VIR  ATLAS', amount: '1500.00' },
        { label: 'VIR ATLAS', amount: '1500' },
        { label: 'FRAIS', amount: '-12.50', reference: 'R1' },
      ],
      'a.csv',
    );
    expect(first).toMatchObject({ fileName: 'a.csv', accountLabel: 'Compte 1', lineCount: 3, duplicateCount: 0, matchedCount: 0, importedByName: 'Test User' });
    const second = await b.imp(
      [
        { label: ' VIR ATLAS ', amount: '1500.0' },
        { label: 'FRAIS', amount: '-12.50', reference: 'R1' },
        { label: 'FRAIS', amount: '-12.50' },
        { label: 'NOUVEAU', amount: '10' },
        { label: 'NOUVEAU', amount: '10.00' },
        { date: '2026-11-11', label: 'VIR ATLAS', amount: '1500' },
      ],
      'b.csv',
    );
    expect([second.lineCount, second.duplicateCount]).toEqual([4, 2]);
    expect((await b.lines()).total).toBe(7);
    const list = (await b.agent.get('/v1/bank/imports').expect(200)).body;
    expect(list.map((i: { fileName: string }) => i.fileName)).toEqual(['b.csv', 'a.csv']);
    const all = await b.imp([{ label: 'VIR ATLAS', amount: '1500' }, { label: 'NOUVEAU', amount: '10' }], 'c.csv');
    expect([all.lineCount, all.duplicateCount]).toEqual([0, 2]);
    expect((await b.agent.post('/v1/bank/imports').send({ fileName: 'x', lines: [] })).status).toBe(422);
    expect((await b.agent.post('/v1/bank/imports').send(importBody([{ label: '   ', amount: '1' }]))).status).toBe(422);
    expect((await events(b.me.tenant.id, 'bank.imported')).length).toBe(3);
  });

  it('lists with filters, search, pagination and workspace counts', async () => {
    const b = await bankSetup();
    const i1 = await b.imp(Array.from({ length: 5 }, (_, n) => ({ date: `2026-11-0${n + 1}`, label: `LIGNE ${n}`, amount: `${10 + n}` })), 'one.csv');
    await b.imp([{ label: 'AUTRE CHOSE', amount: '-5', reference: 'ZZ-REF' }, { label: 'LIGNE X', amount: '-6' }], 'two.csv');
    const l0 = await b.lineOf('LIGNE 0');
    await b.agent.post(`/v1/bank/transactions/${l0.id}/ignore`).expect(200);
    const page1 = await b.lines('?pageSize=3');
    expect(page1.items).toHaveLength(3);
    expect(page1.total).toBe(7);
    expect(page1.counts).toEqual({ UNMATCHED: 6, MATCHED: 0, IGNORED: 1 });
    expect(page1.items.map((l: { date: string }) => l.date)).toEqual(['2026-11-10', '2026-11-10', '2026-11-05']);
    expect((await b.lines('?pageSize=3&page=3')).items).toHaveLength(1);
    const ign = await b.lines('?status=IGNORED');
    expect([ign.total, ign.items.length, ign.counts.UNMATCHED]).toEqual([1, 1, 6]);
    const q = await b.lines('?q=ligne&status=UNMATCHED');
    expect(q.total).toBe(5);
    expect(q.counts).toEqual({ UNMATCHED: 5, MATCHED: 0, IGNORED: 1 });
    expect((await b.lines('?q=zz-ref')).items.map((l: { label: string }) => l.label)).toEqual(['AUTRE CHOSE']);
    expect((await b.lines('?q=100%25')).total).toBe(0);
    const scoped = await b.lines(`?importId=${i1.id}`);
    expect([scoped.total, scoped.counts.IGNORED]).toEqual([5, 1]);
    for (const bad of ['?status=NOPE', '?page=0', '?pageSize=101', '?pageSize=abc']) expect((await b.agent.get(`/v1/bank/transactions${bad}`)).status).toBe(422);
  });

  it('suggests open invoices: number, amount, customer, best first, at most five', async () => {
    const b = await bankSetup();
    const c1 = await b.customer('Zenith Ouest SARL');
    const c2 = await b.customer('Boulangerie Najma');
    const byNumber = await b.invoiceFor(c1, '1');
    const byAmount = await b.invoiceFor(c2, '3');
    const both = await b.invoiceFor(c2, '5');
    const credit = (await b.agent.post(`/v1/invoices/${byNumber.id}/credit-note`).expect(201)).body;
    await b.invoiceFor(c1, '9', false);
    await b.imp([
      { label: `vir recu ${byNumber.number.replace(/-/g, ' ').toLowerCase()}`, amount: '1.00' },
      { label: 'VIR DIVERS', amount: byAmount.totals.amountDue },
      { label: `PAIEMENT ${both.number} ZENITH-OUEST`, amount: both.totals.amountDue },
      { label: 'VIR ZENITH OUEST', amount: '3.00' },
      { label: 'VIR INCONNU', amount: '3.33' },
      { label: `SORTIE ${byNumber.number}`, amount: '-1200' },
    ]);
    const sug = async (label: string) => (await b.lineOf(label)).suggestions;
    const n = await sug(`vir recu ${byNumber.number.replace(/-/g, ' ').toLowerCase()}`);
    expect(n.map((s: { number: string; reasons: string[] }) => [s.number, s.reasons])).toEqual([[byNumber.number, ['NUMBER']]]);
    expect(n[0]).toMatchObject({ customerName: 'Zenith Ouest SARL', dueDate: byNumber.dueDate, amountDue: byNumber.totals.amountDue });
    const a = await sug('VIR DIVERS');
    expect(a.map((s: { number: string }) => s.number)).toEqual([byAmount.number]);
    expect(a[0].reasons).toEqual(['AMOUNT']);
    const combo = await sug(`PAIEMENT ${both.number} ZENITH-OUEST`);
    expect(combo.map((s: { number: string; reasons: string[] }) => [s.number, s.reasons.join('+')])).toEqual([
      [both.number, 'NUMBER+AMOUNT'],
      [byNumber.number, 'CUSTOMER'],
    ]);
    expect((await sug('VIR ZENITH OUEST')).map((s: { reasons: string[] }) => s.reasons)).toEqual([['CUSTOMER']]);
    expect(await sug('VIR INCONNU')).toEqual([]);
    expect(await sug(`SORTIE ${byNumber.number}`)).toEqual([]);
    expect(credit.number).toBeNull();

    const c3 = await b.customer('Pharmacie Hassan');
    for (let i = 0; i < 7; i++) await b.invoiceFor(c3, String(i + 1));
    await b.imp([{ label: 'VIR PHARMACIE HASSAN', amount: '5' }]);
    expect((await sug('VIR PHARMACIE HASSAN')).length).toBe(5);
    await b.agent.post(`/v1/bank/transactions/${(await b.lineOf('VIR INCONNU')).id}/ignore`).expect(200);
    expect(((await b.lineOf('VIR INCONNU')) as { suggestions: unknown[] }).suggestions).toEqual([]);
  });

  it('matches one or several invoices, partly allocated, and the invoices and dashboard follow', async () => {
    const b = await bankSetup();
    const c = await b.customer('Client Banque');
    const i1 = await b.invoiceFor(c, '1');
    const i2 = await b.invoiceFor(c, '2');
    await b.imp([
      { date: '2026-11-12', label: 'VIR CLIENT BANQUE', amount: '3600.00', reference: 'REF-77' },
      { date: '2026-11-13', label: 'VIR FACTURE', amount: '1200.00' },
    ]);
    const before = (await b.agent.get('/v1/dashboard').expect(200)).body;
    const line = await b.lineOf('VIR CLIENT BANQUE');
    const res = await b.agent
      .post(`/v1/bank/transactions/${line.id}/match`)
      .send({ method: 'CHEQUE', allocations: [{ invoiceId: i1.id, amount: i1.totals.amountDue }, { invoiceId: i2.id, amount: '2000' }] })
      .expect(200);
    expect(res.body.status).toBe('MATCHED');
    expect(res.body.suggestions).toEqual([]);
    expect(res.body.allocations.map((a: { amount: string }) => a.amount).sort()).toEqual(['1200.00', '2000.00']);
    expect(res.body.allocations[0]).toMatchObject({ customerName: 'Client Banque' });
    const paid1 = await invoiceOf(b.agent as never, i1.id);
    expect(paid1.paymentStatus).toBe('PAID');
    expect(paid1.payments[0]).toMatchObject({ paidOn: '2026-11-12', method: 'CHEQUE', reference: 'REF-77', amount: '1200.00' });
    expect(Object.keys(paid1.payments[0]).sort()).toEqual(['amount', 'id', 'invoiceId', 'method', 'paidOn', 'reference', 'taxWithheld', 'vatWithheld']);
    const paid2 = await invoiceOf(b.agent as never, i2.id);
    expect([paid2.paymentStatus, paid2.paidAmount]).toEqual(['PARTIALLY_PAID', '2000.00']);
    const after = (await b.agent.get('/v1/dashboard').expect(200)).body;
    expect(new Decimal(before.outstanding).minus(after.outstanding).toFixed(2)).toBe('3200.00');
    expect((await b.agent.get('/v1/bank/imports').expect(200)).body[0].matchedCount).toBe(1);
    expect((await b.lines()).counts).toEqual({ UNMATCHED: 1, MATCHED: 1, IGNORED: 0 });

    const l2 = await b.lineOf('VIR FACTURE');
    await b.agent.post(`/v1/bank/transactions/${l2.id}/match`).send({ allocations: [{ invoiceId: i2.id, amount: '400.00' }] }).expect(200);
    expect((await invoiceOf(b.agent as never, i2.id)).payments.at(-1).reference).toBe('VIR FACTURE');
    expect((await events(b.me.tenant.id, 'bank.matched')).length).toBe(2);
    expect((await events(b.me.tenant.id, 'payment.recorded')).length).toBe(3);
  });

  it('refuses what cannot be matched', async () => {
    const b = await bankSetup();
    const c = await b.customer('Client Refus');
    const inv = await b.invoiceFor(c, '1');
    const draft = await b.invoiceFor(c, '1', false);
    const credit = (await b.agent.post(`/v1/invoices/${inv.id}/credit-note`).expect(201)).body;
    const creditIssued = (await b.agent.post(`/v1/invoices/${credit.id}/issue`).expect(200)).body;
    const other = await bankSetup();
    const oc = await other.customer('Autre');
    const foreign = await other.invoiceFor(oc, '1');
    await b.imp([
      { label: 'IN', amount: '5000.00' },
      { label: 'OUT', amount: '-100.00' },
      { label: 'SMALL', amount: '500.00' },
    ]);
    const post = async (label: string, allocations: unknown[]) => {
      const l = await b.lineOf(label);
      return b.agent.post(`/v1/bank/transactions/${l.id}/match`).send({ allocations });
    };
    const out = await post('OUT', [{ invoiceId: inv.id, amount: '10' }]);
    expect([out.status, out.body.code]).toEqual([409, 'NOT_MATCHABLE']);
    const over = await post('IN', [{ invoiceId: inv.id, amount: '1200.01' }]);
    expect([over.status, over.body.code]).toEqual([409, 'OVERPAYMENT']);
    const twice = await post('IN', [{ invoiceId: inv.id, amount: '1000' }, { invoiceId: inv.id, amount: '300' }]);
    expect([twice.status, twice.body.code]).toEqual([409, 'OVERPAYMENT']);
    expect((await invoiceOf(b.agent as never, inv.id)).payments).toEqual([]);
    expect((await post('SMALL', [{ invoiceId: inv.id, amount: '400' }, { invoiceId: inv.id, amount: '200' }])).status).toBe(422);
    expect((await post('IN', [{ invoiceId: inv.id, amount: '0' }])).status).toBe(422);
    expect((await post('IN', [])).status).toBe(422);
    expect((await post('IN', [{ invoiceId: draft.id, amount: '10' }])).status).toBe(409);
    expect((await post('IN', [{ invoiceId: creditIssued.id, amount: '10' }])).status).toBe(409);
    expect((await post('IN', [{ invoiceId: foreign.id, amount: '10' }])).status).toBe(404);
    expect((await post('IN', [{ invoiceId: none, amount: '10' }])).status).toBe(404);
    expect((await b.lineOf('IN')).status).toBe('UNMATCHED');
    await b.agent.post(`/v1/bank/transactions/${none}/match`).send({ allocations: [{ invoiceId: inv.id, amount: '1' }] }).expect(404);

    expect((await post('IN', [{ invoiceId: inv.id, amount: '1200' }])).status).toBe(200);
    const again = await post('IN', [{ invoiceId: inv.id, amount: '1' }]);
    expect([again.status, again.body.code]).toEqual([409, 'NOT_MATCHABLE']);
    const ign = await b.agent.post(`/v1/bank/transactions/${(await b.lineOf('SMALL')).id}/ignore`).expect(200);
    expect((await post('SMALL', [{ invoiceId: inv.id, amount: '1' }])).body.code).toBe('NOT_MATCHABLE');
    expect(ign.body.status).toBe('IGNORED');
  });

  it('lets exactly one of two concurrent matches through', async () => {
    const b = await bankSetup();
    const c = await b.customer('Client Course');
    const i1 = await b.invoiceFor(c, '1');
    const i2 = await b.invoiceFor(c, '1');
    await b.imp([{ label: 'COURSE', amount: '2400.00' }]);
    const l = await b.lineOf('COURSE');
    const [x, y] = await Promise.all([
      b.agent.post(`/v1/bank/transactions/${l.id}/match`).send({ allocations: [{ invoiceId: i1.id, amount: '1200' }] }),
      b.agent.post(`/v1/bank/transactions/${l.id}/match`).send({ allocations: [{ invoiceId: i2.id, amount: '1200' }] }),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    const n = (await admin.query('select count(*)::int n from payments where bank_transaction_id = $1', [l.id])).rows[0].n;
    expect(n).toBe(1);
  });

  it('unmatches by voiding the payments, and a manual void frees the line too', async () => {
    const b = await bankSetup();
    const c = await b.customer('Client Annulation');
    const i1 = await b.invoiceFor(c, '1');
    const i2 = await b.invoiceFor(c, '1');
    await b.imp([{ label: 'A ANNULER', amount: '2400.00' }, { label: 'MANUEL', amount: '1200.00' }]);
    const l = await b.lineOf('A ANNULER');
    await b.agent.post(`/v1/bank/transactions/${l.id}/match`).send({ allocations: [{ invoiceId: i1.id, amount: '1200' }, { invoiceId: i2.id, amount: '700' }] }).expect(200);
    const dash = (await b.agent.get('/v1/dashboard').expect(200)).body.outstanding;
    const un = await b.agent.post(`/v1/bank/transactions/${l.id}/unmatch`).expect(200);
    expect([un.body.status, un.body.allocations]).toEqual(['UNMATCHED', []]);
    for (const i of [i1, i2]) {
      const inv = await invoiceOf(b.agent as never, i.id);
      expect([inv.paymentStatus, inv.paidAmount, inv.payments]).toEqual(['UNPAID', '0.00', []]);
    }
    expect(new Decimal((await b.agent.get('/v1/dashboard').expect(200)).body.outstanding).minus(dash).toFixed(2)).toBe('1900.00');
    expect((await b.agent.post(`/v1/bank/transactions/${l.id}/unmatch`)).status).toBe(409);
    expect((await events(b.me.tenant.id, 'bank.unmatched')).length).toBe(1);
    expect((await events(b.me.tenant.id, 'payment.voided')).length).toBe(2);
    await b.agent.post(`/v1/bank/transactions/${l.id}/match`).send({ allocations: [{ invoiceId: i1.id, amount: '1200' }] }).expect(200);

    const m = await b.lineOf('MANUEL');
    const matched = (await b.agent.post(`/v1/bank/transactions/${m.id}/match`).send({ allocations: [{ invoiceId: i2.id, amount: '1200' }] }).expect(200)).body;
    await b.agent.delete(`/v1/payments/${matched.allocations[0].paymentId}`).expect(200);
    expect((await b.lineOf('MANUEL')).status).toBe('UNMATCHED');
  });

  it('ignores and unignores, only from the right state', async () => {
    const b = await bankSetup();
    const c = await b.customer('Client Etat');
    const inv = await b.invoiceFor(c, '1');
    await b.imp([{ label: 'FRAIS BANQUE', amount: '-30' }, { label: 'REGLEMENT', amount: '1200.00' }]);
    const fees = await b.lineOf('FRAIS BANQUE');
    expect((await b.agent.post(`/v1/bank/transactions/${fees.id}/unignore`)).status).toBe(409);
    expect((await b.agent.post(`/v1/bank/transactions/${fees.id}/ignore`).expect(200)).body.status).toBe('IGNORED');
    expect((await b.agent.post(`/v1/bank/transactions/${fees.id}/ignore`)).status).toBe(409);
    expect((await b.agent.post(`/v1/bank/transactions/${fees.id}/unignore`).expect(200)).body.status).toBe('UNMATCHED');
    const pay = await b.lineOf('REGLEMENT');
    await b.agent.post(`/v1/bank/transactions/${pay.id}/match`).send({ allocations: [{ invoiceId: inv.id, amount: '1200' }] }).expect(200);
    expect((await b.agent.post(`/v1/bank/transactions/${pay.id}/ignore`)).status).toBe(409);
    expect((await b.agent.post(`/v1/bank/transactions/${pay.id}/unignore`)).status).toBe(409);
    expect((await events(b.me.tenant.id, 'bank.ignored')).length).toBe(2);
  });

  it('deletes an import unless a line is matched', async () => {
    const b = await bankSetup();
    const c = await b.customer('Client Suppression');
    const inv = await b.invoiceFor(c, '1');
    const free = await b.imp([{ label: 'LIBRE', amount: '1' }], 'libre.csv');
    const used = await b.imp([{ label: 'UTILISEE', amount: '1200.00' }, { label: 'AUTRE', amount: '3' }], 'utilisee.csv');
    await b.agent.delete(`/v1/bank/imports/${free.id}`).expect(204);
    expect((await b.lineOf('LIBRE'))).toBeUndefined();
    const l = await b.lineOf('UTILISEE');
    await b.agent.post(`/v1/bank/transactions/${l.id}/match`).send({ allocations: [{ invoiceId: inv.id, amount: '1200' }] }).expect(200);
    const refused = await b.agent.delete(`/v1/bank/imports/${used.id}`);
    expect([refused.status, refused.body.code]).toEqual([409, 'HAS_MATCHES']);
    expect((await b.lines()).total).toBe(2);
    await b.agent.post(`/v1/bank/transactions/${l.id}/unmatch`).expect(200);
    await b.agent.delete(`/v1/bank/imports/${used.id}`).expect(204);
    await b.agent.delete(`/v1/bank/imports/${used.id}`).expect(404);
    expect((await b.lines()).total).toBe(0);
    expect((await invoiceOf(b.agent as never, inv.id)).payments).toEqual([]);
    expect((await events(b.me.tenant.id, 'bank.import_deleted')).length).toBe(2);
  });

  it('applies the role table', async () => {
    const body = importBody([{ label: 'X', amount: '1' }]);
    const rows: [string, (a: ReturnType<typeof request>) => Promise<{ status: number }>, string[]][] = [
      ['read lines', (a) => a.get('/v1/bank/transactions'), ['OWNER', 'ADMIN', 'MEMBER', 'ACCOUNTANT', 'VIEWER']],
      ['read imports', (a) => a.get('/v1/bank/imports'), ['OWNER', 'ADMIN', 'MEMBER', 'ACCOUNTANT', 'VIEWER']],
      ['import', (a) => a.post('/v1/bank/imports').send(body), ['OWNER', 'ADMIN', 'MEMBER']],
      ['match', (a) => a.post(`/v1/bank/transactions/${none}/match`).send({ allocations: [{ invoiceId: none, amount: '1' }] }), ['OWNER', 'ADMIN', 'MEMBER']],
      ['ignore', (a) => a.post(`/v1/bank/transactions/${none}/ignore`), ['OWNER', 'ADMIN', 'MEMBER']],
      ['unignore', (a) => a.post(`/v1/bank/transactions/${none}/unignore`), ['OWNER', 'ADMIN', 'MEMBER']],
      ['unmatch', (a) => a.post(`/v1/bank/transactions/${none}/unmatch`), ['OWNER', 'ADMIN']],
      ['delete import', (a) => a.delete(`/v1/bank/imports/${none}`), ['OWNER', 'ADMIN']],
    ];
    for (const role of ['OWNER', 'ADMIN', 'MEMBER', 'ACCOUNTANT', 'VIEWER'] as const) {
      const r = await asRole(role);
      for (const [name, call, allowed] of rows) {
        const status = (await call(r.agent as never)).status;
        expect({ role, name, forbidden: status === 403 }, `${role} ${name} -> ${status}`).toEqual({ role, name, forbidden: !allowed.includes(role) });
      }
    }
  });

  it('keeps workspaces apart', async () => {
    const a = await bankSetup();
    const b = await bankSetup();
    const imp = await a.imp([{ label: 'SECRET A', amount: '99.00' }]);
    const line = await a.lineOf('SECRET A');
    expect((await b.lines()).total).toBe(0);
    expect((await b.agent.get('/v1/bank/imports').expect(200)).body).toEqual([]);
    expect((await b.lines(`?importId=${imp.id}`)).total).toBe(0);
    await b.agent.post(`/v1/bank/transactions/${line.id}/ignore`).expect(404);
    await b.agent.delete(`/v1/bank/imports/${imp.id}`).expect(404);
    const same = await b.imp([{ label: 'SECRET A', amount: '99.00' }]);
    expect(same.duplicateCount).toBe(0);
  });

  it('removes bank data when a workspace closes and keeps the payments', async () => {
    const b = await bankSetup();
    const c = await b.customer('Client Fermeture');
    const inv = await b.invoiceFor(c, '1');
    await b.imp([{ label: 'REGLEMENT FERMETURE', amount: '1200.00' }, { label: 'RESTE', amount: '5' }]);
    const l = await b.lineOf('REGLEMENT FERMETURE');
    await b.agent.post(`/v1/bank/transactions/${l.id}/match`).send({ allocations: [{ invoiceId: inv.id, amount: '1200' }] }).expect(200);
    const tenant = b.me.tenant.id as string;
    await b.agent.post('/v1/tenant/close').send({ password: PASSWORD, confirmName: 'Société Test' }).expect(204);
    for (const t of ['bank_transactions', 'bank_imports']) {
      expect((await admin.query(`select 1 from ${t} where tenant_id = $1`, [tenant])).rowCount, t).toBe(0);
    }
    const kept = (await admin.query('select bank_transaction_id, amount::text from payments where tenant_id = $1 and voided_at is null', [tenant])).rows;
    expect(kept).toEqual([{ bank_transaction_id: l.id, amount: '1200.00' }]);
  });

  it('forces RLS on the bank tables', async () => {
    const { rows } = await admin.query(`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity,
        (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
      from pg_class c where c.relname in ('bank_imports', 'bank_transactions')`);
    expect(rows.map((r) => r.relname).sort()).toEqual(['bank_imports', 'bank_transactions']);
    for (const r of rows) expect([r.relrowsecurity, r.relforcerowsecurity, r.policies > 0]).toEqual([true, true, true]);
  });
});

describe('purchase invoices', () => {
  const none = '00000000-0000-4000-8000-000000000000';
  const dayOff = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toLocaleDateString('en-CA');
  };
  const vat = (rate: string, net: string) => ({ vatRate: rate, net, vat: new Decimal(net).times(rate).div(100).toFixed(2) });
  const setupP = async () => {
    const o = await ownerWithCompany();
    const supplier = async (extra: Record<string, unknown> = {}, name = `Fournisseur ${Math.random().toString(36).slice(2, 7)}`) =>
      (await o.agent.post('/v1/parties').send({ ...customerBody, kind: 'SUPPLIER', name, ifNumber: '12345678', ...extra }).expect(201)).body;
    const sup = await supplier();
    let n = 0;
    const body = (over: Record<string, unknown> = {}) => ({
      supplierId: sup.id,
      number: `F-${++n}-${Math.random().toString(36).slice(2, 6)}`,
      issueDate: '2026-09-01',
      dueDate: '2026-10-01',
      category: 'SERVICES',
      description: 'Prestation',
      vatLines: [vat('20', '1000.00')],
      vatDeductible: true,
      ...over,
    });
    const make = async (over: Record<string, unknown> = {}) => (await o.agent.post('/v1/purchases').send(body(over)).expect(201)).body;
    const approved = async (over: Record<string, unknown> = {}) => {
      const p = await make(over);
      return (await o.agent.post(`/v1/purchases/${p.id}/approve`).expect(200)).body;
    };
    const pay = (id: string, over: Record<string, unknown> = {}) =>
      o.agent.post(`/v1/purchases/${id}/payments`).send({ paidOn: '2026-09-10', method: 'TRANSFER', amount: '100.00', ...over });
    return { ...o, sup, supplier, body, make, approved, pay };
  };

  it('creates in TO_APPROVE with totals, and validates amounts, rates, supplier and dates', async () => {
    const s = await setupP();
    const p = (await s.agent.post('/v1/purchases').send(s.body({ vatLines: [vat('20', '1000'), vat('10', '500.00'), { vatRate: '0', net: '200', vat: '0' }] })).expect(201)).body;
    expect(p).toMatchObject({ state: 'TO_APPROVE', currency: 'MAD', totalNet: '1700.00', totalVat: '250.00', totalGross: '1950.00', amountDue: '1950.00', paidAmount: '0.00', paymentStatus: 'UNPAID', overdue: false, disputed: false, rejectionReason: null, createdByName: 'Test User', approvedAt: null });
    expect(p.supplier).toMatchObject({ name: s.sup.name, ice: s.sup.ice });
    expect(await events(s.me.tenant.id, 'purchase.created')).toHaveLength(1);
    await s.agent.get(`/v1/purchases/${p.id}`).expect(200);

    const bad = async (over: Record<string, unknown>, path: string) => {
      const r = await s.agent.post('/v1/purchases').send(s.body(over));
      expect([r.status, r.body.issues?.[0]?.path], JSON.stringify(over)).toEqual([422, path]);
    };
    await s.agent.post('/v1/purchases').send(s.body({ vatLines: [{ vatRate: '20', net: '1000', vat: '200.99' }] })).expect(201);
    await bad({ vatLines: [{ vatRate: '20', net: '1000', vat: '201.01' }] }, 'vatLines.0.vat');
    await bad({ vatLines: [{ vatRate: '14', net: '1000', vat: '140' }] }, 'vatLines.0.vatRate');
    await bad({ vatLines: [{ vatRate: '20', net: '-10', vat: '0' }] }, 'vatLines.0.net');
    await bad({ vatLines: [{ vatRate: '0', net: '0', vat: '0' }] }, 'vatLines');
    await bad({ dueDate: '2026-08-31' }, 'dueDate');
    await bad({ issueDate: '2026-02-31' }, 'issueDate');
    await bad({ supplierId: none }, 'supplierId');
    const customer = (await s.agent.post('/v1/parties').send(customerBody).expect(201)).body;
    await bad({ supplierId: customer.id }, 'supplierId');
    expect((await s.agent.post('/v1/purchases').send({ ...s.body(), vatLines: [] })).status).toBe(422);
    expect((await s.agent.post('/v1/purchases').send({ ...s.body(), number: '' })).status).toBe(422);
    const both = (await s.agent.post('/v1/parties').send({ ...customerBody, kind: 'BOTH', name: 'Les deux' }).expect(201)).body;
    await s.agent.post('/v1/purchases').send(s.body({ supplierId: both.id })).expect(201);
  });

  it('refuses duplicates, also when created concurrently', async () => {
    const s = await setupP();
    await s.agent.post('/v1/purchases').send(s.body({ number: 'FA 2026/001' })).expect(201);
    for (const n of ['fa 2026/001', ' FA2026/001 ', 'FA  2026/001']) {
      const r = await s.agent.post('/v1/purchases').send(s.body({ number: n }));
      expect([r.status, r.body.code], n).toEqual([409, 'DUPLICATE']);
    }
    const other = await s.supplier();
    await s.agent.post('/v1/purchases').send(s.body({ number: 'FA 2026/001', supplierId: other.id })).expect(201);
    const results = await Promise.all(Array.from({ length: 5 }, () => s.agent.post('/v1/purchases').send(s.body({ number: 'COURSE-1' }))));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
    expect((await admin.query("select count(*)::int n from purchases where tenant_id = $1 and number = 'COURSE-1'", [s.me.tenant.id])).rows[0].n).toBe(1);
    const mine = await s.make({ number: 'AUTRE' });
    const clash = await s.agent.put(`/v1/purchases/${mine.id}`).send(s.body({ number: 'fa2026/001' }));
    expect([clash.status, clash.body.code]).toEqual([409, 'DUPLICATE']);
    await s.agent.put(`/v1/purchases/${mine.id}`).send(s.body({ number: 'AUTRE' })).expect(200);
    await expect(admin.query("insert into purchases (tenant_id, supplier_id, number, number_key, issue_date, due_date, category, description, vat_lines, vat_deductible, total_net, total_vat, total_gross, state) select tenant_id, supplier_id, 'x', number_key, issue_date, due_date, category, description, vat_lines, vat_deductible, total_net, total_vat, total_gross, state from purchases where id = $1", [mine.id])).rejects.toThrow(/purchases_number_uq/);
  });

  it('edits and deletes only before approval, and walks the state machine', async () => {
    const s = await setupP();
    const p = await s.make({ number: 'ETAT-1' });
    const edited = (await s.agent.put(`/v1/purchases/${p.id}`).send(s.body({ number: 'ETAT-1', description: 'Modifiée', vatLines: [vat('10', '2000')] })).expect(200)).body;
    expect([edited.description, edited.totalGross]).toEqual(['Modifiée', '2200.00']);
    await s.agent.post(`/v1/purchases/${p.id}/reject`).send({}).expect(422);
    const rej = (await s.agent.post(`/v1/purchases/${p.id}/reject`).send({ reason: 'Montant inattendu' }).expect(200)).body;
    expect([rej.state, rej.rejectionReason]).toEqual(['REJECTED', 'Montant inattendu']);
    for (const call of [() => s.agent.post(`/v1/purchases/${p.id}/approve`), () => s.agent.post(`/v1/purchases/${p.id}/reject`).send({ reason: 'x' }), () => s.agent.post(`/v1/purchases/${p.id}/reopen`), () => s.agent.post(`/v1/purchases/${p.id}/dispute`).send({ disputed: true })]) {
      expect((await call()).status).toBe(409);
    }
    expect((await s.pay(p.id)).body.code).toBe('NOT_APPROVED');
    const back = (await s.agent.put(`/v1/purchases/${p.id}`).send(s.body({ number: 'ETAT-1' })).expect(200)).body;
    expect([back.state, back.rejectionReason]).toEqual(['TO_APPROVE', null]);
    const ok = (await s.agent.post(`/v1/purchases/${p.id}/approve`).expect(200)).body;
    expect([ok.state, ok.approvedByName]).toEqual(['APPROVED', 'Test User']);
    expect(ok.approvedAt).not.toBeNull();
    for (const call of [() => s.agent.put(`/v1/purchases/${p.id}`).send(s.body({ number: 'ETAT-1' })), () => s.agent.delete(`/v1/purchases/${p.id}`)]) {
      const r = await call();
      expect([r.status, r.body.code]).toEqual([409, 'NOT_EDITABLE']);
    }
    expect((await s.agent.post(`/v1/purchases/${p.id}/approve`)).status).toBe(409);
    expect((await s.agent.post(`/v1/purchases/${p.id}/reject`).send({ reason: 'x' })).status).toBe(409);
    await s.pay(p.id, { amount: '50' }).expect(201);
    const held = await s.agent.post(`/v1/purchases/${p.id}/reopen`);
    expect([held.status, held.body.code]).toEqual([409, 'HAS_PAYMENTS']);
    await s.agent.delete(`/v1/purchases/${p.id}/payments/${(await s.agent.get(`/v1/purchases/${p.id}`)).body.payments[0].id}`).expect(200);
    const reopened = (await s.agent.post(`/v1/purchases/${p.id}/reopen`).expect(200)).body;
    expect([reopened.state, reopened.approvedAt, reopened.approvedByName]).toEqual(['TO_APPROVE', null, null]);
    const gone = await s.agent.delete(`/v1/purchases/${p.id}`);
    expect([gone.status, gone.body.code]).toEqual([409, 'HAS_PAYMENTS']);
    const q = await s.make();
    await s.agent.delete(`/v1/purchases/${q.id}`).expect(204);
    await s.agent.get(`/v1/purchases/${q.id}`).expect(404);
    for (const a of ['approved', 'rejected', 'reopened', 'payment_recorded', 'payment_voided', 'deleted', 'updated']) {
      expect((await events(s.me.tenant.id, `purchase.${a}`)).length, a).toBeGreaterThan(0);
    }
  });

  it('freezes the supplier at approval', async () => {
    const s = await setupP();
    const sup = await s.supplier({ ice: '001509876000041' }, 'Nom avant');
    const p = await s.make({ supplierId: sup.id });
    await s.agent.patch(`/v1/parties/${sup.id}`).send({ name: 'Nom après' }).expect(200);
    expect((await s.agent.get(`/v1/purchases/${p.id}`)).body.supplier.name).toBe('Nom après');
    await s.agent.post(`/v1/purchases/${p.id}/approve`).expect(200);
    await s.agent.patch(`/v1/parties/${sup.id}`).send({ name: 'Encore changé', ice: '001509876000999' }).expect(200);
    expect((await s.agent.get(`/v1/purchases/${p.id}`)).body.supplier).toEqual({ name: 'Nom après', ice: '001509876000041', ifNumber: '12345678' });
    const del = await s.agent.delete(`/v1/parties/${sup.id}`);
    expect(del.status).toBe(409);
    const draftOnly = await s.supplier();
    await s.make({ supplierId: draftOnly.id });
    expect((await s.agent.delete(`/v1/parties/${draftOnly.id}`)).status).toBe(409);
  });

  it('records payments with withholdings and refuses the invalid ones', async () => {
    const s = await setupP();
    const p = await s.approved({ vatLines: [vat('20', '1000')] });
    const first = (await s.pay(p.id, { amount: '900.00', vatWithheld: '150.00', taxWithheld: '50.00', reference: 'VIR-1' }).expect(201)).body;
    expect(first.payments[0]).toMatchObject({ paidOn: '2026-09-10', method: 'TRANSFER', amount: '900.00', vatWithheld: '150.00', taxWithheld: '50.00', settled: '1100.00', reference: 'VIR-1' });
    expect([first.paidAmount, first.amountDue, first.paymentStatus]).toEqual(['1100.00', '100.00', 'PARTIAL']);
    const over = await s.pay(p.id, { amount: '100.01' });
    expect([over.status, over.body.code]).toEqual([409, 'OVERPAYMENT']);
    const overVat = await s.pay(p.id, { amount: '1', vatWithheld: '50.01' });
    expect([overVat.status, overVat.body.issues[0].path]).toEqual([422, 'vatWithheld']);
    expect((await s.pay(p.id, { amount: '0' })).status).toBe(422);
    expect((await s.pay(p.id, { amount: '-5' })).status).toBe(422);
    expect((await s.pay(p.id, { paidOn: '2026-08-31' })).body.issues[0].path).toBe('paidOn');
    expect((await s.pay(p.id, { amount: '0', taxWithheld: '10' }).expect(201)).body.paidAmount).toBe('1110.00');
    const done = (await s.pay(p.id, { amount: '40.00', vatWithheld: '50' }).expect(201)).body;
    expect([done.paymentStatus, done.amountDue, done.paidAmount]).toEqual(['PAID', '0.00', '1200.00']);
    expect((await s.pay(p.id, { amount: '0.01' })).body.code).toBe('OVERPAYMENT');
    expect((await s.pay(none)).status).toBe(404);

    const v = (await s.agent.delete(`/v1/purchases/${p.id}/payments/${done.payments.at(-1).id}`).expect(200)).body;
    expect([v.paymentStatus, v.amountDue, v.payments.length]).toEqual(['PARTIAL', '90.00', 2]);
    await s.agent.delete(`/v1/purchases/${p.id}/payments/${done.payments.at(-1).id}`).expect(404);
    const kept = (await admin.query('select count(*)::int n, count(voided_at)::int v from purchase_payments where purchase_id = $1', [p.id])).rows[0];
    expect(kept).toEqual({ n: 3, v: 1 });
    expect((await s.pay(p.id, { amount: '90.00' }).expect(201)).body.paymentStatus).toBe('PAID');
    await expect(admin.query('delete from purchase_payments where purchase_id = $1', [p.id])).rejects.toThrow(/seulement annulé/);
    await expect(appPool.query('update purchase_payments set amount = 1 where purchase_id = $1', [p.id])).rejects.toThrow();
  });

  it('computes overdue, dispute and the warnings', async () => {
    const s = await setupP();
    const late = await s.approved({ issueDate: '2026-01-10', dueDate: '2026-02-10' });
    expect(late.overdue).toBe(true);
    const disp = (await s.agent.post(`/v1/purchases/${late.id}/dispute`).send({ disputed: true }).expect(200)).body;
    expect([disp.disputed, disp.overdue]).toEqual([true, false]);
    expect((await admin.query('select disputed_at is not null as s, dispute_cleared_at is null as c from purchases where id = $1', [late.id])).rows[0]).toEqual({ s: true, c: true });
    const lifted = (await s.agent.post(`/v1/purchases/${late.id}/dispute`).send({ disputed: false }).expect(200)).body;
    expect([lifted.disputed, lifted.overdue]).toEqual([false, true]);
    expect((await admin.query('select dispute_cleared_at is not null as c from purchases where id = $1', [late.id])).rows[0].c).toBe(true);
    const paidUp = (await s.pay(late.id, { amount: '1200', paidOn: '2026-02-01' }).expect(201)).body;
    expect([paidUp.overdue, paidUp.paymentStatus]).toEqual([false, 'PAID']);
    expect((await s.agent.post(`/v1/purchases/${(await s.make()).id}/dispute`).send({ disputed: true })).body.code).toBe('NOT_APPROVED');
    const notYet = await s.approved({ dueDate: '2099-01-01', issueDate: '2026-09-01', number: 'LONG' });
    expect(notYet.overdue).toBe(false);

    expect(notYet.warnings).toEqual(['TERM_TOO_LONG']);
    const bare = await s.supplier({ ice: undefined, ifNumber: undefined });
    await s.agent.patch(`/v1/parties/${bare.id}`).send({ ice: null, ifNumber: null }).catch(() => undefined);
    await admin.query('update parties set ice = null, if_number = null where id = $1', [bare.id]);
    const w = await s.make({ supplierId: bare.id });
    expect(w.warnings).toEqual(['SUPPLIER_ICE_MISSING', 'SUPPLIER_IF_MISSING']);

    const cash = await s.supplier({}, 'Fournisseur Espèces');
    const a = await s.approved({ supplierId: cash.id, vatLines: [vat('20', '10000')] });
    const b = await s.approved({ supplierId: cash.id, vatLines: [vat('20', '10000')] });
    expect(a.warnings).toEqual([]);
    await s.pay(a.id, { method: 'CASH', amount: '3000', paidOn: '2026-09-10' }).expect(201);
    await s.pay(b.id, { method: 'CASH', amount: '2000', paidOn: '2026-09-10' }).expect(201);
    expect((await s.agent.get(`/v1/purchases/${a.id}`)).body.warnings).toEqual([]);
    await s.pay(b.id, { method: 'CASH', amount: '0.01', paidOn: '2026-09-10' }).expect(201);
    expect((await s.agent.get(`/v1/purchases/${a.id}`)).body.warnings).toEqual(['CASH_LIMIT']);
    expect((await s.agent.get(`/v1/purchases/${b.id}`)).body.warnings).toEqual(['CASH_LIMIT']);
    const c = await s.approved({ supplierId: cash.id, vatLines: [vat('20', '60000')] });
    for (const day of ['02', '05', '08', '12', '15', '18', '22', '25', '27', '29']) await s.pay(c.id, { method: 'CASH', amount: '4900', paidOn: `2026-10-${day}` }).expect(201);
    expect((await s.agent.get(`/v1/purchases/${c.id}`)).body.warnings).not.toContain('CASH_LIMIT');
    await s.pay(c.id, { method: 'CASH', amount: '1100', paidOn: '2026-10-30' }).expect(201);
    expect((await s.agent.get(`/v1/purchases/${c.id}`)).body.warnings).toContain('CASH_LIMIT');
    const bank = await s.approved({ supplierId: cash.id, number: 'VIR' });
    await s.pay(bank.id, { amount: '1200', paidOn: '2026-10-30' }).expect(201);
    expect((await s.agent.get(`/v1/purchases/${bank.id}`)).body.warnings).toEqual([]);
    const voidPay = (await s.agent.get(`/v1/purchases/${b.id}`)).body.payments.at(-1);
    await s.agent.delete(`/v1/purchases/${b.id}/payments/${voidPay.id}`).expect(200);
    expect((await s.agent.get(`/v1/purchases/${a.id}`)).body.warnings).toEqual([]);
  });

  it('lists with filters, search, pagination and a workspace overview', async () => {
    const s = await setupP();
    const other = await s.supplier({}, 'Zeta Fournitures');
    const p1 = await s.approved({ number: 'L-1', issueDate: '2026-06-01', dueDate: '2026-07-01', description: 'Hébergement serveur' });
    const p2 = await s.approved({ number: 'L-2', issueDate: '2026-07-01', dueDate: dayOff(3), supplierId: other.id });
    const p3 = await s.make({ number: 'L-3', issueDate: '2026-08-01' });
    const p4 = await s.approved({ number: 'L-4', issueDate: '2026-09-01', dueDate: dayOff(30) });
    await s.pay(p4.id, { amount: '1200' }).expect(201);
    await s.pay(p1.id, { amount: '200' }).expect(201);
    const rej = await s.make({ number: 'L-5', issueDate: '2026-10-01' });
    await s.agent.post(`/v1/purchases/${rej.id}/reject`).send({ reason: 'non' }).expect(200);
    await s.agent.post(`/v1/purchases/${p2.id}/dispute`).send({ disputed: true }).expect(200);
    const list = async (q = '') => (await s.agent.get(`/v1/purchases${q}`).expect(200)).body;
    const all = await list();
    expect(all.total).toBe(5);
    expect(all.items.map((i: { number: string }) => i.number)).toEqual(['L-5', 'L-4', 'L-3', 'L-2', 'L-1']);
    expect(all.items[4]).toMatchObject({ supplierName: s.sup.name, supplierId: s.sup.id, overdue: true, paymentStatus: 'PARTIAL', amountDue: '1000.00', totalGross: '1200.00', category: 'SERVICES', warningCount: 0 });
    expect(all.overview).toEqual({ toApprove: 1, unpaidTotal: '2200.00', overdueTotal: '1000.00', overdueCount: 1, dueWithin7Days: '0.00' });
    await s.agent.post(`/v1/purchases/${p2.id}/dispute`).send({ disputed: false }).expect(200);
    expect((await list()).overview).toEqual({ toApprove: 1, unpaidTotal: '2200.00', overdueTotal: '1000.00', overdueCount: 1, dueWithin7Days: '1200.00' });

    expect((await list('?state=TO_APPROVE')).items.map((i: { number: string }) => i.number)).toEqual(['L-3']);
    expect((await list('?paymentStatus=PAID')).items.map((i: { number: string }) => i.number)).toEqual(['L-4']);
    expect((await list('?paymentStatus=PARTIAL')).total).toBe(1);
    expect((await list('?paymentStatus=UNPAID')).total).toBe(3);
    expect((await list('?overdue=true')).items.map((i: { number: string }) => i.number)).toEqual(['L-1']);
    expect((await list('?overdue=false')).total).toBe(4);
    expect((await list(`?supplierId=${other.id}`)).total).toBe(1);
    expect((await list('?q=zeta')).items[0].number).toBe('L-2');
    expect((await list('?q=hébergement')).items[0].number).toBe('L-1');
    expect((await list('?q=l-4')).total).toBe(1);
    expect((await list('?q=100%25')).total).toBe(0);
    expect((await list('?from=2026-07-01&to=2026-08-31')).items.map((i: { number: string }) => i.number)).toEqual(['L-3', 'L-2']);
    const page = await list('?pageSize=2&page=2');
    expect([page.total, page.items.map((i: { number: string }) => i.number)]).toEqual([5, ['L-3', 'L-2']]);
    expect((await list('?state=APPROVED&pageSize=2')).overview.toApprove).toBe(1);
    for (const bad of ['?state=X', '?paymentStatus=X', '?overdue=maybe', '?page=0', '?pageSize=101', '?from=hier']) expect((await s.agent.get(`/v1/purchases${bad}`)).status).toBe(422);
  });

  it('applies the role table, and a MEMBER never approves', async () => {
    const none2 = none;
    const rows: [string, (a: ReturnType<typeof request>) => Promise<{ status: number }>, string[]][] = [
      ['list', (a) => a.get('/v1/purchases'), ['OWNER', 'ADMIN', 'MEMBER', 'ACCOUNTANT', 'VIEWER']],
      ['get', (a) => a.get(`/v1/purchases/${none2}`), ['OWNER', 'ADMIN', 'MEMBER', 'ACCOUNTANT', 'VIEWER']],
      ['create', (a) => a.post('/v1/purchases').send({ supplierId: none2, number: 'x', issueDate: '2026-09-01', dueDate: '2026-10-01', description: 'd', vatLines: [{ vatRate: '20', net: '1', vat: '0.2' }] }), ['OWNER', 'ADMIN', 'MEMBER']],
      ['edit', (a) => a.put(`/v1/purchases/${none2}`).send({ supplierId: none2, number: 'x', issueDate: '2026-09-01', dueDate: '2026-10-01', description: 'd', vatLines: [{ vatRate: '20', net: '1', vat: '0.2' }] }), ['OWNER', 'ADMIN', 'MEMBER']],
      ['pay', (a) => a.post(`/v1/purchases/${none2}/payments`).send({ paidOn: '2026-09-01', method: 'CASH', amount: '1' }), ['OWNER', 'ADMIN', 'MEMBER']],
      ['dispute', (a) => a.post(`/v1/purchases/${none2}/dispute`).send({ disputed: true }), ['OWNER', 'ADMIN', 'MEMBER']],
      ['approve', (a) => a.post(`/v1/purchases/${none2}/approve`), ['OWNER', 'ADMIN']],
      ['reject', (a) => a.post(`/v1/purchases/${none2}/reject`).send({ reason: 'x' }), ['OWNER', 'ADMIN']],
      ['reopen', (a) => a.post(`/v1/purchases/${none2}/reopen`), ['OWNER', 'ADMIN']],
      ['delete', (a) => a.delete(`/v1/purchases/${none2}`), ['OWNER', 'ADMIN']],
      ['void payment', (a) => a.delete(`/v1/purchases/${none2}/payments/${none2}`), ['OWNER', 'ADMIN']],
    ];
    for (const role of ['OWNER', 'ADMIN', 'MEMBER', 'ACCOUNTANT', 'VIEWER'] as const) {
      const r = await asRole(role);
      for (const [name, call, allowed] of rows) {
        const status = (await call(r.agent as never)).status;
        expect({ role, name, forbidden: status === 403 }, `${role} ${name} -> ${status}`).toEqual({ role, name, forbidden: !allowed.includes(role) });
      }
    }
    const s = await setupP();
    const m = await join(s.agent as never, 'MEMBER');
    const mine = (await m.agent.post('/v1/purchases').send(s.body()).expect(201)).body;
    expect((await m.agent.post(`/v1/purchases/${mine.id}/approve`)).status).toBe(403);
    expect((await s.agent.post(`/v1/purchases/${mine.id}/approve`).expect(200)).body.approvedByName).toBe('Test User');
    await m.agent.post(`/v1/purchases/${mine.id}/payments`).send({ paidOn: '2026-09-10', method: 'TRANSFER', amount: '10' }).expect(201);
  });

  it('keeps workspaces apart', async () => {
    const a = await setupP();
    const b = await setupP();
    const p = await a.approved();
    expect((await b.agent.get('/v1/purchases').expect(200)).body.total).toBe(0);
    for (const call of [() => b.agent.get(`/v1/purchases/${p.id}`), () => b.agent.post(`/v1/purchases/${p.id}/reopen`), () => b.pay(p.id), () => b.agent.delete(`/v1/purchases/${p.id}`)]) {
      expect((await call()).status).toBe(404);
    }
    expect((await b.agent.post('/v1/purchases').send(a.body({ supplierId: a.sup.id }))).status).toBe(422);
    await b.agent.post('/v1/purchases').send(b.body({ number: p.number })).expect(201);
  });

  it('is in the export, survives closure when approved, and goes with the retention purge', async () => {
    const s = await setupP();
    const keep = await s.approved({ number: 'GARDEE' });
    await s.pay(keep.id, { amount: '500', vatWithheld: '100', reference: 'V1' }).expect(201);
    const pending = await s.make({ number: 'EN-ATTENTE' });
    const rejected = await s.make({ number: 'REJETEE' });
    await s.agent.post(`/v1/purchases/${rejected.id}/reject`).send({ reason: 'non' }).expect(200);
    const unused = await s.supplier({}, 'Fournisseur sans facture');
    const exported = (await s.agent.get('/v1/export').expect(200)).body;
    expect(exported.purchases.map((p: { number: string }) => p.number).sort()).toEqual(['EN-ATTENTE', 'GARDEE', 'REJETEE']);
    expect(exported.purchases.find((p: { number: string }) => p.number === 'GARDEE').payments).toHaveLength(1);
    expect(exported.purchasePayments).toHaveLength(1);

    const tenant = s.me.tenant.id as string;
    await s.agent.post('/v1/tenant/close').send({ password: PASSWORD, confirmName: 'Société Test' }).expect(204);
    const q = async (sql: string) => (await admin.query(sql, [tenant])).rows;
    expect((await q('select number, created_by_name, approved_by_name, created_by from purchases where tenant_id = $1')).map((r) => r.number)).toEqual(['GARDEE']);
    expect(await q('select created_by_name, approved_by_name, created_by from purchases where tenant_id = $1')).toEqual([{ created_by_name: 'Utilisateur supprimé', approved_by_name: 'Utilisateur supprimé', created_by: null }]);
    expect(await q('select amount::text, vat_withheld::text, reference from purchase_payments where tenant_id = $1')).toEqual([{ amount: '500.00', vat_withheld: '100.00', reference: 'V1' }]);
    const partyNames = (await q('select name from parties where tenant_id = $1')).map((r) => r.name);
    expect(partyNames).toEqual([s.sup.name]);
    expect(partyNames).not.toContain(unused.name);
    expect(pending.id).toBeDefined();
    expect((await q('select retain_until::text r from tenants where id = $1'))[0].r).toBe('2036-12-31');

    const retention = app.get(RetentionService, { strict: false });
    await retention.run(new Date('2030-01-01T03:00:00Z'));
    expect(await q('select 1 from purchases where tenant_id = $1')).toHaveLength(1);
    await retention.run(new Date('2037-01-02T03:00:00Z'));
    for (const t of ['purchases', 'purchase_payments', 'parties']) expect(await q(`select 1 from ${t} where tenant_id = $1`), t).toHaveLength(0);
  });

  it('forces RLS on the purchase tables', async () => {
    const { rows } = await admin.query(`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity,
        (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
      from pg_class c where c.relname in ('purchases', 'purchase_payments')`);
    expect(rows.map((r) => r.relname).sort()).toEqual(['purchase_payments', 'purchases']);
    for (const r of rows) expect([r.relrowsecurity, r.relforcerowsecurity, r.policies > 0]).toEqual([true, true, true]);
  });
});

describe('withholding on sales payments', () => {
  const todayStr = () => new Date().toLocaleDateString('en-CA');
  const setupW = async () => {
    const o = await ownerWithCompany();
    const party = (await o.agent.post('/v1/parties').send({ ...customerBody, name: 'Commune de Test' }).expect(201)).body;
    // 37.5 x 1000 at 20 %: net 37 500, VAT 7 500, 45 000 TTC
    const d = (await o.agent.post('/v1/invoices').send({ customerId: party.id, issueDate: '2026-03-10', lines: [{ ...line, quantity: '37.5' }] }).expect(201)).body;
    const inv = (await o.agent.post(`/v1/invoices/${d.id}/issue`).expect(200)).body;
    const pay = (body: Record<string, unknown>) => o.agent.post(`/v1/invoices/${inv.id}/payments`).send({ paidOn: todayStr(), method: 'TRANSFER', ...body });
    return { ...o, party, inv, pay };
  };

  it('settles an invoice with cash plus withholdings, and keeps collected figures in cash', async () => {
    const s = await setupW();
    expect(s.inv.totals.amountDue).toBe('45000.00');
    const before = (await s.agent.get('/v1/dashboard').expect(200)).body;
    const res = (await s.pay({ amount: '39375.00', vatWithheld: '5625.00' }).expect(201)).body;
    expect(res.payments[0]).toMatchObject({ amount: '39375.00', vatWithheld: '5625.00', taxWithheld: '0.00' });
    expect([res.paidAmount, res.paymentStatus, res.overdue]).toEqual(['45000.00', 'PAID', false]);
    const list = (await s.agent.get('/v1/invoices').expect(200)).body.find((i: { id: string }) => i.id === s.inv.id);
    expect([list.paidAmount, list.paymentStatus]).toEqual(['45000.00', 'PAID']);
    const after = (await s.agent.get('/v1/dashboard').expect(200)).body;
    expect(new Decimal(after.collectedThisMonth).minus(before.collectedThisMonth).toFixed(2)).toBe('39375.00');
    expect(new Decimal(before.outstanding).minus(after.outstanding).toFixed(2)).toBe('45000.00');
    expect(after.monthly.at(-1).collected).toBe(after.collectedThisMonth);
    expect(after.recentPayments[0]).toMatchObject({ amount: '39375.00', vatWithheld: '5625.00' });
    expect(new Decimal(after.vatCollectedThisMonth).minus(before.vatCollectedThisMonth).toFixed(2)).toBe('7500.00');
    expect((await s.pay({ amount: '1' })).status).toBe(422);
    const out = (await s.agent.get('/v1/export').expect(200)).body;
    expect(out.payments[0]).toMatchObject({ amount: '39375.00', vatWithheld: '5625.00' });
    const v = (await s.agent.delete(`/v1/payments/${res.payments[0].id}`).expect(200)).body;
    expect([v.paymentStatus, v.paidAmount]).toEqual(['UNPAID', '0.00']);
  });

  it('applies the validation rules', async () => {
    const s = await setupW();
    const path = async (body: Record<string, unknown>) => {
      const r = await s.pay(body);
      return [r.status, r.body.issues?.[0]?.path, r.body.issues?.[0]?.rule];
    };
    expect(await path({ amount: '0' })).toEqual([422, 'amount', 'PAYMENT-POSITIVE']);
    expect(await path({ amount: '-1' })).toEqual([422, 'amount', 'PAYMENT-POSITIVE']);
    expect(await path({ amount: '10', vatWithheld: '-1' })).toEqual([422, 'vatWithheld', 'PAYMENT-NEGATIVE']);
    expect(await path({ amount: '10', taxWithheld: '-1' })).toEqual([422, 'taxWithheld', 'PAYMENT-NEGATIVE']);
    expect(await path({ amount: '40000', vatWithheld: '5000.01' })).toEqual([422, 'amount', 'PAYMENT-EXCEEDS']);
    expect(await path({ amount: '100', vatWithheld: '7500.01' })).toEqual([422, 'vatWithheld', 'PAYMENT-VAT-EXCEEDS']);
    await s.pay({ amount: '0', taxWithheld: '500' }).expect(201);
    const first = (await s.pay({ amount: '1000', vatWithheld: '7000' }).expect(201)).body;
    expect(first.paidAmount).toBe('8500.00');
    expect(await path({ amount: '10', vatWithheld: '500.01' })).toEqual([422, 'vatWithheld', 'PAYMENT-VAT-EXCEEDS']);
    await s.pay({ amount: '10', vatWithheld: '500' }).expect(201);
    expect((await s.pay({ amount: '36000' })).body.issues[0].rule).toBe('PAYMENT-EXCEEDS');
    expect((await s.pay({ amount: '35990.00' }).expect(201)).body.paymentStatus).toBe('PAID');
    await expect(appPool.query('update payments set vat_withheld = 1 where invoice_id = $1', [s.inv.id])).rejects.toThrow();
  });

  it('counts the settled sum for overdue, reminders and bank suggestions, and bank matches stay cash', async () => {
    const s = await setupW();
    await s.pay({ amount: '30000', vatWithheld: '5625' }).expect(201);
    const pdf = pdfBytes('w');
    await s.agent.put(`/v1/invoices/${s.inv.id}/pdf`).set('Content-Type', 'application/pdf').set('X-Internal-Token', env.internalToken).send(pdf).expect(204);
    const reminder = (await s.agent.get(`/v1/invoices/${s.inv.id}/send-preview?kind=REMINDER`).expect(200)).body;
    expect(reminder.message).toContain('9 375,00 MAD');
    const inv = (await s.agent.get(`/v1/invoices/${s.inv.id}`).expect(200)).body;
    expect([inv.paidAmount, inv.paymentStatus, inv.overdue]).toEqual(['35625.00', 'PARTIALLY_PAID', true]);
    const dash = (await s.agent.get('/v1/dashboard').expect(200)).body;
    expect(dash.overdue).toBe('9375.00');
    expect(dash.aging.d31to60 === '9375.00' || dash.aging.d61to90 === '9375.00' || dash.aging.over90 === '9375.00' || dash.aging.d1to30 === '9375.00').toBe(true);
    await s.agent.post('/v1/bank/imports').send({ fileName: 'w.csv', lines: [{ date: '2026-11-10', label: 'VIR DIVERS', amount: '9375.00' }, { date: '2026-11-11', label: 'VIR AUTRE', amount: '9375.00' }] }).expect(201);
    const lines = (await s.agent.get('/v1/bank/transactions').expect(200)).body.items;
    expect(lines[0].suggestions[0]).toMatchObject({ invoiceId: s.inv.id, amountDue: '9375.00', reasons: ['AMOUNT'] });
    const matched = (await s.agent.post(`/v1/bank/transactions/${lines[0].id}/match`).send({ allocations: [{ invoiceId: s.inv.id, amount: '9375.00' }] }).expect(200)).body;
    expect(matched.allocations[0].amount).toBe('9375.00');
    const paid = (await s.agent.get(`/v1/invoices/${s.inv.id}`).expect(200)).body;
    expect(paid.payments.find((p: { amount: string }) => p.amount === '9375.00')).toMatchObject({ vatWithheld: '0.00', taxWithheld: '0.00' });
    expect(paid.paymentStatus).toBe('PAID');
  });

  it('stores the VAT basis on the company, CASH by default', async () => {
    const o = await ownerWithCompany();
    expect((await o.agent.get('/v1/company').expect(200)).body.vatBasis).toBe('CASH');
    const accrual = (await o.agent.put('/v1/company').send({ ...company, email: uniqueEmail('c'), vatBasis: 'ACCRUAL' }).expect(200)).body;
    expect(accrual.vatBasis).toBe('ACCRUAL');
    expect((await o.agent.put('/v1/company').send({ ...company, email: uniqueEmail('c'), vatBasis: 'NOPE' })).status).toBe(422);
  });
});

describe('reports', () => {
  const setupR = async () => {
    const o = await ownerWithCompany();
    const customer = (await o.agent.post('/v1/parties').send({ ...customerBody, name: 'Client Rapport' }).expect(201)).body;
    const supplier = (await o.agent.post('/v1/parties').send({ ...customerBody, kind: 'SUPPLIER', name: 'Fournisseur Rapport', ifNumber: '777' }).expect(201)).body;
    const invoice = async (lines: Record<string, unknown>[], issueDate = '2026-03-10', type = 'INVOICE', extra: Record<string, unknown> = {}) => {
      const d = (await o.agent.post('/v1/invoices').send({ customerId: customer.id, issueDate, type, lines, ...extra }).expect(201)).body;
      return (await o.agent.post(`/v1/invoices/${d.id}/issue`).expect(200)).body;
    };
    const pay = (id: string, paidOn: string, body: Record<string, unknown>) =>
      o.agent.post(`/v1/invoices/${id}/payments`).send({ method: 'TRANSFER', paidOn, ...body }).expect(201);
    let n = 0;
    const purchase = async (over: Record<string, unknown>, approve = true) => {
      const body = { supplierId: supplier.id, number: `R-${++n}`, issueDate: '2026-03-02', dueDate: '2026-04-02', category: 'SERVICES', description: 'Achat', vatDeductible: true, ...over };
      const p = (await o.agent.post('/v1/purchases').send(body).expect(201)).body;
      return approve ? (await o.agent.post(`/v1/purchases/${p.id}/approve`).expect(200)).body : p;
    };
    const ppay = (id: string, paidOn: string, body: Record<string, unknown>) =>
      o.agent.post(`/v1/purchases/${id}/payments`).send({ method: 'TRANSFER', paidOn, vatWithheld: '0', taxWithheld: '0', ...body });
    const report = async (path: string) => (await o.agent.get(`/v1/reports/${path}`).expect(200)).body;
    return { ...o, customer, supplier, invoice, pay, purchase, ppay, report };
  };
  const vl = (rate: string, net: string) => ({ vatRate: rate, net, vat: new Decimal(net).times(rate).div(100).toFixed(2) });

  it('prepares the VAT statement on a cash basis, then on an accrual basis', async () => {
    const s = await setupR();
    const i1 = await s.invoice([{ ...line, quantity: '2' }]);
    const i2 = await s.invoice([{ ...line, quantity: '1' }, { ...line, quantity: '1', unitPrice: '500', vatRate: '10' }, { ...line, quantity: '1', unitPrice: '300', vatRate: '0' }]);
    const i3 = await s.invoice([{ ...line, quantity: '1' }]);
    const i4 = await s.invoice([{ ...line, quantity: '1' }]);
    await s.pay(i1.id, '2026-03-20', { amount: '2400' });
    await s.pay(i2.id, '2026-03-21', { amount: '1025' });
    await s.pay(i2.id, '2026-04-05', { amount: '1025' });
    await s.pay(i3.id, '2026-03-22', { amount: '900', vatWithheld: '150', taxWithheld: '50' });
    const gone = (await s.pay(i4.id, '2026-03-12', { amount: '1200' })).body.payments[0];
    await s.agent.delete(`/v1/payments/${gone.id}`).expect(200);
    const cn = await s.invoice([{ ...line, quantity: '1', unitPrice: '500' }], '2026-03-25', 'CREDIT_NOTE', { originalInvoiceId: i1.id });
    const p1 = await s.purchase({ vatLines: [vl('20', '1000')] });
    await s.ppay(p1.id, '2026-03-15', { amount: '1200' }).expect(201);
    const p2 = await s.purchase({ category: 'GOODS', vatLines: [vl('20', '2000')] });
    await s.ppay(p2.id, '2026-03-16', { amount: '1200' }).expect(201);
    const p3 = await s.purchase({ category: 'FIXED_ASSET', vatLines: [vl('10', '5000')] });
    await s.ppay(p3.id, '2026-03-17', { amount: '5500' }).expect(201);
    const p4 = await s.purchase({ vatDeductible: false, vatLines: [vl('20', '800')] });
    await s.ppay(p4.id, '2026-03-18', { amount: '960' }).expect(201);
    const p6 = await s.purchase({ vatLines: [vl('20', '700')] });
    const voided = (await s.ppay(p6.id, '2026-03-19', { amount: '840' }).expect(201)).body.payments[0];
    await s.agent.delete(`/v1/purchases/${p6.id}/payments/${voided.id}`).expect(200);
    await s.purchase({ vatLines: [vl('20', '999')] }, false);
    const p7 = await s.purchase({ vatLines: [vl('20', '500')] });
    await s.ppay(p7.id, '2026-04-02', { amount: '600' }).expect(201);

    const mar = await s.report('vat?period=2026-03');
    expect(mar).toMatchObject({ period: '2026-03', from: '2026-03-01', to: '2026-03-31', basis: 'CASH', filingDeadline: '2026-04-30', previousCredit: '0.00' });
    expect(mar.collected).toEqual({
      byRate: [{ vatRate: '20', base: '2916.67', vat: '583.33' }, { vatRate: '10', base: '250.00', vat: '25.00' }],
      exemptBase: '150.00',
      totalBase: '3316.67',
      totalVat: '608.33',
    });
    expect(mar.withheldByCustomers).toBe('150.00');
    expect(mar.deductible).toEqual({
      services: { base: '1000.00', vat: '200.00' },
      goods: { base: '1000.00', vat: '200.00' },
      fixedAssets: { base: '5000.00', vat: '500.00' },
      totalVat: '900.00',
    });
    expect([mar.vatDue, mar.creditCarriedForward]).toEqual(['0.00', '441.67']);
    expect(mar.deductions).toHaveLength(3);
    expect(mar.deductions[0]).toMatchObject({ purchaseId: p1.id, supplierName: 'Fournisseur Rapport', supplierIf: '777', supplierIce: customerBody.ice, category: 'SERVICES', vatRate: '20', base: '1000.00', vat: '200.00', paidOn: '2026-03-15', method: 'TRANSFER', reference: null });
    expect(mar.sales.filter((r: { invoiceId: string }) => r.invoiceId === cn.id)).toEqual([{ invoiceId: cn.id, number: cn.number, customerName: 'Client Rapport', date: '2026-03-25', vatRate: '20', base: '-500.00', vat: '-100.00' }]);
    expect(mar.sales.some((r: { invoiceId: string }) => r.invoiceId === i4.id)).toBe(false);
    expect(mar.notices).toEqual(['PURCHASES_TO_APPROVE']);

    const apr = await s.report('vat?period=2026-04&previousCredit=5');
    expect(apr.collected.totalVat).toBe('125.00');
    expect(apr.deductible.services).toEqual({ base: '500.00', vat: '100.00' });
    expect([apr.previousCredit, apr.vatDue, apr.creditCarriedForward]).toEqual(['5.00', '20.00', '0.00']);
    const q1 = await s.report('vat?period=2026-Q1');
    expect([q1.from, q1.to, q1.collected.totalVat, q1.deductible.totalVat, q1.notices]).toEqual(['2026-01-01', '2026-03-31', '608.33', '900.00', ['PERIOD_MISMATCH', 'PURCHASES_TO_APPROVE']]);
    expect(new Decimal((await s.report('vat?period=2026-Q2')).collected.totalVat).toFixed(2)).toBe('125.00');

    const cur = new Date().toLocaleDateString('en-CA').slice(0, 7);
    expect((await s.report(`vat?period=${cur}`)).notices).toContain('PERIOD_NOT_OVER');

    await s.agent.put('/v1/company').send({ ...company, email: uniqueEmail('c'), vatBasis: 'ACCRUAL' }).expect(200);
    const acc = await s.report('vat?period=2026-03');
    expect(acc.basis).toBe('ACCRUAL');
    expect(acc.collected).toEqual({
      byRate: [{ vatRate: '20', base: '4500.00', vat: '900.00' }, { vatRate: '10', base: '500.00', vat: '50.00' }],
      exemptBase: '300.00',
      totalBase: '5300.00',
      totalVat: '950.00',
    });
    expect(acc.withheldByCustomers).toBe('150.00');
    expect(acc.deductible.totalVat).toBe('900.00');
    expect((await s.report('vat?period=2026-04')).collected.totalVat).toBe('0.00');
    await s.agent.put('/v1/company').send({ ...company, email: uniqueEmail('c'), vatRegime: 'NOT_SUBJECT' }).expect(200);
    expect((await s.report('vat?period=2026-03')).notices).toContain('NOT_SUBJECT');
  });

  it('adds up to the invoice to the cent whatever the payments', async () => {
    const s = await setupR();
    const inv = await s.invoice([{ ...line, quantity: '3', unitPrice: '33.33' }, { ...line, quantity: '7', unitPrice: '12.41', vatRate: '10' }]);
    const gross = new Decimal(inv.totals.totalGross);
    const parts = ['40.01', '33.33', gross.minus('73.34').toFixed(2)];
    await s.pay(inv.id, '2026-03-05', { amount: parts[0] });
    await s.pay(inv.id, '2026-04-06', { amount: parts[1] });
    await s.pay(inv.id, '2026-04-20', { amount: parts[2] });
    const rows = [];
    for (const period of ['2026-03', '2026-04']) rows.push(...(await s.report(`vat?period=${period}`)).sales);
    const mine = rows.filter((r: { invoiceId: string }) => r.invoiceId === inv.id);
    for (const b of inv.totals.breakdown) {
      const forRate = mine.filter((r: { vatRate: string }) => new Decimal(r.vatRate).eq(b.rate));
      expect(forRate.reduce((a: any, r: { base: string }) => a.plus(r.base), new Decimal(0)).toFixed(2), `base ${b.rate}`).toBe(b.base);
      expect(forRate.reduce((a: any, r: { vat: string }) => a.plus(r.vat), new Decimal(0)).toFixed(2), `vat ${b.rate}`).toBe(b.vat);
    }
    const q = await s.report('vat?period=2026-Q1');
    expect(q.collected.totalVat).not.toBe('0.00');
    const supplierPurchase = await s.purchase({ vatLines: [vl('20', '333.33'), vl('10', '111.11')] });
    await s.ppay(supplierPurchase.id, '2026-03-05', { amount: '100.01' }).expect(201);
    await s.ppay(supplierPurchase.id, '2026-04-06', { amount: '200.02' }).expect(201);
    await s.ppay(supplierPurchase.id, '2026-04-07', { amount: new Decimal(supplierPurchase.totalGross).minus('300.03').toFixed(2) }).expect(201);
    const ded = [...(await s.report('vat?period=2026-03')).deductions, ...(await s.report('vat?period=2026-04')).deductions];
    for (const line of supplierPurchase.vatLines) {
      const forRate = ded.filter((d: { vatRate: string }) => new Decimal(d.vatRate).eq(line.vatRate));
      expect(forRate.reduce((a: any, r: { base: string }) => a.plus(r.base), new Decimal(0)).toFixed(2)).toBe(new Decimal(line.net).toFixed(2));
      expect(forRate.reduce((a: any, r: { vat: string }) => a.plus(r.vat), new Decimal(0)).toFixed(2)).toBe(new Decimal(line.vat).toFixed(2));
    }
  });

  it('flags cash above the limit on the VAT statement', async () => {
    const s = await setupR();
    const p = await s.purchase({ vatLines: [vl('20', '10000')] });
    await s.ppay(p.id, '2026-03-18', { amount: '6000', method: 'CASH' }).expect(201);
    expect((await s.report('vat?period=2026-03')).notices).toEqual(['CASH_LIMIT']);
    expect((await s.report('vat?period=2026-04')).notices).toEqual([]);
  });

  it('lists withholdings on suppliers and by customers', async () => {
    const s = await setupR();
    const inv = await s.invoice([{ ...line, quantity: '1' }]);
    await s.pay(inv.id, '2026-03-22', { amount: '900', vatWithheld: '150', taxWithheld: '50' });
    await s.pay(inv.id, '2026-04-22', { amount: '100' });
    const p = await s.purchase({ vatLines: [vl('20', '1000')], number: 'RET-1' });
    await s.ppay(p.id, '2026-03-19', { amount: '900', vatWithheld: '150', taxWithheld: '100', reference: 'V9' }).expect(201);
    await s.ppay(p.id, '2026-03-25', { amount: '50' }).expect(201);
    const w = await s.report('withholdings?period=2026-03');
    expect(w.onSuppliers).toMatchObject({ totalVat: '150.00', totalTax: '100.00', remittanceDeadline: '2026-04-30' });
    expect(w.onSuppliers.rows).toEqual([expect.objectContaining({ documentId: p.id, number: 'RET-1', partyName: 'Fournisseur Rapport', partyIf: '777', paidOn: '2026-03-19', totalNet: '1000.00', totalVat: '200.00', vatWithheld: '150.00', taxWithheld: '100.00' })]);
    expect(w.byCustomers).toMatchObject({ totalVat: '150.00', totalTax: '50.00' });
    expect(w.byCustomers.rows).toEqual([expect.objectContaining({ documentId: inv.id, number: inv.number, partyName: 'Client Rapport', totalNet: '1000.00', totalVat: '200.00', paidOn: '2026-03-22' })]);
    const q = await s.report('withholdings?period=2026-Q1');
    expect([q.from, q.to, q.onSuppliers.rows.length, q.onSuppliers.remittanceDeadline]).toEqual(['2026-01-01', '2026-03-31', 1, '2026-04-30']);
    const empty = await s.report('withholdings?period=2026-05');
    expect([empty.onSuppliers.rows, empty.byCustomers.rows, empty.onSuppliers.totalVat]).toEqual([[], [], '0.00']);
    expect((await s.report('withholdings?period=2026-12')).onSuppliers.remittanceDeadline).toBe('2027-01-31');
  });

  it('computes the late-payment statement', async () => {
    const s = await setupR();
    const mk = async (over: Record<string, unknown>, net = '1000') => s.purchase({ vatLines: [vl('20', net)], ...over });
    const t1 = await mk({ number: 'T1', issueDate: '2025-12-01', dueDate: '2026-01-15' });
    await s.ppay(t1.id, '2026-02-20', { amount: '1200' }).expect(201);
    await mk({ number: 'T2', issueDate: '2025-11-01', dueDate: '2025-12-01' }, '2000');
    await mk({ number: 'T3', issueDate: '2025-10-01', dueDate: '2026-06-01' }, '5000');
    const t4 = await mk({ number: 'T4', issueDate: '2025-10-01', dueDate: '2025-11-01' });
    await s.agent.post(`/v1/purchases/${t4.id}/dispute`).send({ disputed: true }).expect(200);
    const t5 = await mk({ number: 'T5', issueDate: '2026-01-20', dueDate: '2026-02-10' });
    await s.ppay(t5.id, '2026-02-10', { amount: '1200' }).expect(201);
    const t6 = await mk({ number: 'T6', issueDate: '2025-10-01', dueDate: '2025-11-01' });
    await s.ppay(t6.id, '2025-12-10', { amount: '1200' }).expect(201);
    const t7 = await mk({ number: 'T7', issueDate: '2025-12-20', dueDate: '2026-01-10' }, '833.33');
    await s.ppay(t7.id, '2026-01-05', { amount: '400' }).expect(201);
    await s.ppay(t7.id, '2026-02-05', { amount: '300' }).expect(201);
    await mk({ number: 'T8', issueDate: '2025-10-01', dueDate: '2025-11-01' }, '1000').then(async (p) => {
      await s.agent.post(`/v1/purchases/${p.id}/reopen`).expect(200);
    });

    const q = await s.report('payment-terms?period=2026-Q1');
    expect(q).toMatchObject({ period: '2026-Q1', from: '2026-01-01', to: '2026-03-31', filingDeadline: '2026-04-30', monthlyIncrement: '0.85' });
    expect(q.keyRates.at(-1)).toEqual({ from: '2025-03-18', rate: '2.25' });
    expect(q.notices).toEqual(['PURCHASES_TO_APPROVE']);
    const row = (n: string, status: string) => q.rows.find((r: { number: string; status: string }) => r.number === n && r.status === status);
    expect(row('T1', 'PAID_LATE')).toMatchObject({ legalDueDate: '2026-01-15', settledOn: '2026-02-20', lateAmount: '1200.00', monthsLate: 2, ratePercent: '3.10', fine: '37.20', method: 'TRANSFER', totalGross: '1200.00', supplierIf: '777' });
    expect(row('T2', 'UNPAID')).toMatchObject({ legalDueDate: '2025-12-01', settledOn: null, lateAmount: '2400.00', monthsLate: 4, ratePercent: '4.80', fine: '115.20', method: null, reference: null });
    expect(row('T3', 'UNPAID')).toMatchObject({ legalDueDate: '2026-01-29', lateAmount: '6000.00', monthsLate: 3, ratePercent: '3.95', fine: '237.00' });
    expect(row('T7', 'PAID_LATE')).toMatchObject({ lateAmount: '300.00', monthsLate: 2, ratePercent: '3.10', fine: '9.30' });
    expect(row('T7', 'UNPAID')).toMatchObject({ lateAmount: '300.00', monthsLate: 3, ratePercent: '3.95', fine: '11.85' });
    for (const n of ['T4', 'T5', 'T6', 'T8']) expect(q.rows.some((r: { number: string }) => r.number === n), n).toBe(false);
    expect(q.disputed).toEqual([expect.objectContaining({ number: 'T4', supplierName: 'Fournisseur Rapport', amountDue: '1200.00' })]);
    expect(q.totals).toEqual({ unpaidLate: '8700.00', paidLate: '1500.00', fine: '410.55', count: 5 });

    const o = await s.report('payment-terms?period=2026-Q1&keyRate=3');
    expect(o.notices).toEqual(['KEY_RATE_OVERRIDDEN', 'PURCHASES_TO_APPROVE'].sort((a, b) => o.notices.indexOf(a) - o.notices.indexOf(b)));
    expect(o.keyRates).toEqual([{ from: '2026-01-01', rate: '3.00' }]);
    expect(o.rows.find((r: { number: string; status: string }) => r.number === 'T1').fine).toBe('46.20');
    const m = await s.report('payment-terms?period=2026-03');
    expect(m.notices).toContain('PERIOD_NOT_QUARTER');
    expect(m.rows.some((r: { number: string }) => r.number === 'T1')).toBe(false);
    expect(m.rows.filter((r: { status: string }) => r.status === 'UNPAID')).toHaveLength(3);
    const cur = new Date().toLocaleDateString('en-CA');
    const quarter = `${cur.slice(0, 4)}-Q${Math.floor((Number(cur.slice(5, 7)) - 1) / 3) + 1}`;
    expect((await s.report(`payment-terms?period=${quarter}`)).notices).toContain('PERIOD_NOT_OVER');
    for (const bad of ['keyRate=abc', 'keyRate=-1']) expect((await s.agent.get(`/v1/reports/payment-terms?period=2026-Q1&${bad}`)).status).toBe(422);
  });

  it('validates the period and the parameters', async () => {
    const s = await setupR();
    for (const path of ['vat', 'withholdings', 'payment-terms']) {
      for (const bad of ['', '?period=2026-13', '?period=2026-Q5', '?period=abc', '?period=2026-1', '?period=2026-11-01']) {
        const r = await s.agent.get(`/v1/reports/${path}${bad}`);
        expect([r.status, r.body.issues?.[0]?.path], `${path}${bad}`).toEqual([422, 'period']);
      }
    }
    expect((await s.agent.get('/v1/reports/vat?period=2026-03&previousCredit=-5')).status).toBe(422);
    expect((await s.agent.get('/v1/reports/vat?period=2026-03&previousCredit=x')).status).toBe(422);
    expect((await s.agent.get('/v1/reports/vat?period=2024-02')).body.to).toBe('2024-02-29');
  });

  it('is readable by every role and isolated by workspace', async () => {
    const a = await setupR();
    const inv = await a.invoice([{ ...line, quantity: '1' }]);
    await a.pay(inv.id, '2026-03-22', { amount: '900', vatWithheld: '150', taxWithheld: '50' });
    const p = await a.purchase({ vatLines: [vl('20', '1000')] });
    await a.ppay(p.id, '2026-03-19', { amount: '900', vatWithheld: '150', taxWithheld: '100' }).expect(201);
    await a.purchase({ vatLines: [vl('20', '1000')], issueDate: '2025-10-01', dueDate: '2025-11-01' });
    const b = await setupR();
    expect((await b.report('vat?period=2026-03')).collected.totalVat).toBe('0.00');
    expect((await b.report('vat?period=2026-03')).sales).toEqual([]);
    const w = await b.report('withholdings?period=2026-03');
    expect([w.onSuppliers.rows, w.byCustomers.rows]).toEqual([[], []]);
    expect((await b.report('payment-terms?period=2026-Q1')).rows).toEqual([]);
    for (const role of ['OWNER', 'ADMIN', 'MEMBER', 'ACCOUNTANT', 'VIEWER'] as const) {
      const r = await asRole(role);
      for (const path of ['vat?period=2026-03', 'withholdings?period=2026-03', 'payment-terms?period=2026-Q1']) {
        expect((await r.agent.get(`/v1/reports/${path}`)).status, `${role} ${path}`).toBe(200);
      }
    }
    expect((await anon.get('/v1/reports/vat?period=2026-03')).status).toBe(401);
  });
});
