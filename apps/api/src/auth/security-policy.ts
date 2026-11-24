export const cookieSecure = (nodeEnv: string) => nodeEnv !== 'development' && nodeEnv !== 'test';
export const logResetLinks = (nodeEnv: string) => nodeEnv === 'development';
export const scryptLogN = (nodeEnv: string) => (nodeEnv === 'test' ? 10 : 17);
export const signUpLimit = (nodeEnv: string) => (nodeEnv === 'test' ? 10_000 : 20);
