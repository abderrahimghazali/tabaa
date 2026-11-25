export const cookieSecure = (nodeEnv: string) => nodeEnv !== 'development' && nodeEnv !== 'test';
export const scryptLogN = (nodeEnv: string) => (nodeEnv === 'test' ? 10 : 17);
export const signUpLimit = (nodeEnv: string) => (nodeEnv === 'test' ? 10_000 : 20);
export const signInAccountLimit = (nodeEnv: string) => (nodeEnv === 'test' ? 25 : 10);
export const signInIpLimit = (nodeEnv: string) => (nodeEnv === 'test' ? 5000 : 30);
export const sensitiveLimit = (nodeEnv: string, limit: number) => (nodeEnv === 'test' ? 5000 : limit);
export const globalLimit = (nodeEnv: string) => (nodeEnv === 'test' ? 100_000 : 600);
