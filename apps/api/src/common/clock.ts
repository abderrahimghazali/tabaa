// Production never moves it; tests shift it to step through TOTP windows deterministically.
export const clock = { offsetMs: 0, now: () => Date.now() + clock.offsetMs };
