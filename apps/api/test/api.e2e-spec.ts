import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { Logger } from '@nestjs/common';

const { AppModule } = await import('../src/app.module.js');
const { setup } = await import('../src/setup.js');
const { Dashboard } = await import('@facture/core');
const { Decimal } = await import('decimal.js');
const { env, parseEnv } = await import('../src/env.js');
const { PasswordResetMailer } = await import('../src/auth/auth.service.js');
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
const tenantIds: string[] = [];
const PASSWORD = 'correct-horse-battery';
const uniqueEmail = (tag: string) => `${tag}-${Math.random().toString(36).slice(2, 10)}@example.test`;

const signUp = async (agent: ReturnType<typeof request>, email = uniqueEmail('owner'), password = PASSWORD) => {
  const res = await agent.post('/v1/auth/sign-up').send({ name: 'Test User', email, password, companyName: 'Société Test' });
  if (res.status === 201) tenantIds.push(res.body.tenant.id);
  return res;
};

const draft = async (body: Record<string, unknown> = {}) =>
  (await http.post('/v1/invoices').send({ customerId, issueDate: '2026-03-10', lines: [line], ...body }).expect(201)).body;
const issue = (id: string) => http.post(`/v1/invoices/${id}/issue`);

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  setup(app);
  await app.init();
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

  it('rejects a duplicate email', async () => {
    const email = uniqueEmail('dup');
    await signUp(request(app.getHttpServer()) as never, email);
    const res = await signUp(request(app.getHttpServer()) as never, email.toUpperCase());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
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
    for (let i = 0; i < 12; i++) {
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

    const send = vi.spyOn(PasswordResetMailer.prototype, 'send');
    const logged = vi.spyOn(Logger.prototype, 'log');
    await anon.post('/v1/auth/password/forgot').send({ email }).expect(204);
    await anon.post('/v1/auth/password/forgot').send({ email: uniqueEmail('nobody') }).expect(204);
    for (let i = 0; i < 40 && !send.mock.calls.some(([l]) => l.email === email); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const link = send.mock.calls.map(([l]) => l).find((l) => l.email === email)!;
    expect(logged.mock.calls.some(([m]) => String(m).includes('Password reset link'))).toBe(false);
    send.mockRestore();
    logged.mockRestore();
    const token = new URL(link.url).searchParams.get('token')!;
    expect(link.url).toContain('/reinitialiser?token=');

    const newPassword = 'another-long-password';
    await anon.post('/v1/auth/password/reset').send({ token, password: newPassword }).expect(204);
    const reuse = await anon.post('/v1/auth/password/reset').send({ token, password: 'yet-another-password' });
    expect(reuse.status).toBe(422);
    expect(reuse.body.code).toBe('INVALID_TOKEN');
    expect((await anon.get('/v1/me').set('Cookie', cookie)).status).toBe(401);
    await anon.post('/v1/auth/sign-in').send({ email, password: PASSWORD }).expect(401);
    await anon.post('/v1/auth/sign-in').send({ email, password: newPassword }).expect(200);
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

const asRole = async (role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER') => {
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
  };

  it('refuses to boot when required variables are missing', () => {
    expect(() => parseEnv({})).toThrow(/NODE_ENV[\s\S]*INTERNAL_API_TOKEN/);
    expect(parseEnv(valid).port).toBe(4100);
    for (const key of Object.keys(valid)) {
      expect(() => parseEnv({ ...valid, [key]: undefined })).toThrow(key);
    }
  });

  it('is secure unless explicitly relaxed', () => {
    expect(policy.cookieSecure('production')).toBe(true);
    expect(policy.cookieSecure('development')).toBe(false);
    expect(policy.logResetLinks('production')).toBe(false);
    expect(policy.logResetLinks('test')).toBe(false);
    expect(policy.logResetLinks('development')).toBe(true);
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
        env: { ...process.env, NODE_ENV: 'production' },
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
