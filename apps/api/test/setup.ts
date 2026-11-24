for (const key of ['DATABASE_URL', 'APP_DATABASE_URL', 'AUTH_DATABASE_URL']) {
  const name = new URL(process.env[key]!).pathname.slice(1);
  if (!name.endsWith('_test')) throw new Error(`Refusing to run tests: ${key} targets "${name}", not a *_test database`);
}
if (process.env.NODE_ENV !== 'test') throw new Error('Refusing to run tests outside NODE_ENV=test');
