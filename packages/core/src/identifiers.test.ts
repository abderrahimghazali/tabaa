import { describe, expect, it } from "vitest";
import { formatIce, validateIce, validateRib } from "./identifiers.js";

describe("validateIce", () => {
  it("accepts 15 digits, with or without spaces", () => {
    expect(validateIce("001234567000089")).toEqual({ valid: true });
    expect(validateIce("001234567 0000 89")).toEqual({ valid: true });
  });
  it.each(["", "12345", "00123456700008", "0012345670000890", "00123456700008A"])("rejects %j", (v) => {
    const r = validateIce(v);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("L'ICE doit comporter 15 chiffres");
  });
});

describe("validateRib", () => {
  it("accepts 24 digits, with or without spaces", () => {
    expect(validateRib("011780000012345678901234").valid).toBe(true);
    expect(validateRib("011 780 0000123456789012 34").valid).toBe(true);
  });
  it.each(["", "0117800000123456789012", "0117800000123456789012345", "01178000001234567890123X"])(
    "rejects %j",
    (v) => {
      const r = validateRib(v);
      expect(r.valid).toBe(false);
      expect(r.reason).toContain("24 chiffres");
    },
  );
});

describe("formatIce", () => {
  it("groups 9 + 4 + 2", () => {
    expect(formatIce("001234567000089")).toBe("001234567 0000 89");
    expect(formatIce("001234567 0000 89")).toBe("001234567 0000 89");
  });
  it("returns invalid input unchanged", () => {
    expect(formatIce("123")).toBe("123");
  });
});
