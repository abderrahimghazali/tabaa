import { describe, expect, it } from "vitest";
import { safeNext } from "./session";

describe("safeNext", () => {
  it.each([
    ["//evil.com"],
    ["/\\evil.com"],
    ["/%09/evil.com"],
    ["/%2F%2Fevil.com"],
    ["/%2fevil.com"],
    ["/%5Cevil.com"],
    ["/..//evil.com"],
    ["https://evil.com"],
    ["http://evil.com/factures"],
    ["javascript:alert(1)"],
    ["/path\nwith-newline"],
    ["/%0d%0aSet-Cookie:x=1"],
    ["connexion"],
    [""],
    [null],
    [undefined],
  ])("rejects %s", (input) => {
    expect(safeNext(input as string | null | undefined)).toBe("/");
  });

  it.each([
    ["/factures", "/factures"],
    ["/factures?tab=drafts&q=atlas", "/factures?tab=drafts&q=atlas"],
    ["/clients/9172bb1e-098e-4d2f-9c71-1c35b87578e2", "/clients/9172bb1e-098e-4d2f-9c71-1c35b87578e2"],
    ["/parametres/entreprise#identite", "/parametres/entreprise"],
    ["/articles?new=1", "/articles?new=1"],
  ])("keeps %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  it("never returns an auth page", () => {
    expect(safeNext("/connexion")).toBe("/");
    expect(safeNext("/inscription?x=1")).toBe("/");
    expect(safeNext("/session-expiree")).toBe("/");
  });
});
