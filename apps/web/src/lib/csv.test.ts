import { describe, expect, it } from "vitest";
import { csvAmount, toCsv } from "./csv";

describe("toCsv", () => {
  it("starts with a BOM, separates with semicolons and ends rows with CRLF", () => {
    expect(toCsv(["a", "b"], [["1", "2"]])).toBe("﻿a;b\r\n1;2\r\n");
  });
  it("quotes separators, quotes and line breaks", () => {
    expect(toCsv(["x"], [["a;b"], ['say "hi"'], ["two\nlines"]])).toBe('﻿x\r\n"a;b"\r\n"say ""hi"""\r\n"two\nlines"\r\n');
  });
  it("leaves empty cells empty", () => {
    expect(toCsv(["a", "b", "c"], [["1", null, undefined]])).toBe("﻿a;b;c\r\n1;;\r\n");
  });
  it("turns API decimals into comma decimals", () => {
    expect(csvAmount("1234.50")).toBe("1234,50");
    expect(csvAmount("-0.05")).toBe("-0,05");
  });
});
