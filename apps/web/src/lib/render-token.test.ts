import { describe, expect, it } from "vitest";
import { RENDER_TOKEN_TTL_MS, signRenderToken, verifyRenderToken } from "./render-token";

const secret = "s3cret-token-for-tests";
const id = "0b0e6d3e-2d55-4f46-9d5c-1d2a3b4c5d6e";
const other = "11111111-2222-4333-8444-555555555555";

describe("render token", () => {
  it("accepts a fresh token for its invoice", () => {
    const now = 1_800_000_000_000;
    expect(verifyRenderToken(secret, id, signRenderToken(secret, id, now), now + 1000)).toBe(true);
  });

  it("rejects an expired token", () => {
    const now = 1_800_000_000_000;
    const token = signRenderToken(secret, id, now);
    expect(verifyRenderToken(secret, id, token, now + RENDER_TOKEN_TTL_MS + 1)).toBe(false);
  });

  it("rejects a token for another invoice, another secret or a tampered expiry", () => {
    const now = 1_800_000_000_000;
    const token = signRenderToken(secret, id, now);
    expect(verifyRenderToken(secret, other, token, now)).toBe(false);
    expect(verifyRenderToken("another-secret", id, token, now)).toBe(false);
    const [exp, sig] = token.split(".");
    expect(verifyRenderToken(secret, id, `${Number(exp) + 60_000}.${sig}`, now)).toBe(false);
  });

  it("rejects a token minted with a far-future expiry", () => {
    const now = 1_800_000_000_000;
    const token = signRenderToken(secret, id, now + 3_600_000);
    expect(verifyRenderToken(secret, id, token, now)).toBe(false);
  });

  it.each([[undefined], [""], ["abc"], ["123.456"], ["1800000000000."]])("rejects malformed %s", (token) => {
    expect(verifyRenderToken(secret, id, token as string | undefined, 1_800_000_000_000)).toBe(false);
  });
});
