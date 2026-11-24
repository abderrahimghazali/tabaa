import { describe, expect, it } from "vitest";
import { buildCsp } from "./csp";

describe("buildCsp", () => {
  const prod = buildCsp("abc123", false);

  it("is strict in production", () => {
    expect(prod).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(prod).not.toContain("unsafe-eval");
    expect(prod).toContain("style-src 'self' 'nonce-abc123'");
    for (const d of ["default-src 'self'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'", "connect-src 'self'"]) {
      expect(prod).toContain(d);
    }
  });

  it("only development allows eval", () => {
    expect(buildCsp("n", true)).toContain("'unsafe-eval'");
  });
});
