import { describe, expect, it } from "vitest";
import { analyze, buildLines, decodeBytes, detectSeparator, parseAmount, parseDate, splitRows } from "./bank-csv";

const run = (text: string) => {
  const a = analyze(text);
  return { a, b: buildLines(a) };
};

describe("parseDate", () => {
  it.each([
    ["27/11/2026", "2026-11-27"],
    ["7/1/2026", "2026-01-07"],
    ["27-11-26", "2026-11-27"],
    ["27.11.2026", "2026-11-27"],
    ["2026-11-27", "2026-11-27"],
    ["2026/11/27", "2026-11-27"],
    ["27/11/2026 14:02", "2026-11-27"],
    ["2026-11-27T14:02:00Z", "2026-11-27"],
    ["27112026", "2026-11-27"],
  ])("%s", (input, out) => expect(parseDate(input)).toBe(out));

  it.each(["", "abc", "31/02/2026", "13/13/2026", "00/01/2026", "27/11", "12345"])("rejects %s", (input) => expect(parseDate(input)).toBeNull());
});

describe("parseAmount", () => {
  it.each([
    ["1234,56", "1234.56"],
    ["1 234,56", "1234.56"],
    ["1 234,56", "1234.56"],
    ["1.234,56", "1234.56"],
    ["1,234.56", "1234.56"],
    ["1234.56", "1234.56"],
    ["1.234.567,89", "1234567.89"],
    ["-1 500,00", "-1500.00"],
    ["+250,5", "250.5"],
    ["(250,00)", "-250.00"],
    ["250,00-", "-250.00"],
    ["12 000", "12000"],
    ["1.234.567", "1234567"],
    ["250,00 MAD", "250.00"],
    ["250 DH", "250"],
    ["0,50", "0.50"],
    ["007,5", "7.5"],
  ])("%s", (input, out) => expect(parseAmount(input)).toBe(out));

  it("0 is zero", () => expect(parseAmount("0,00")).toBe("0"));
  it("a lone comma plus three digits follows the file's mark", () => {
    expect(parseAmount("1,234", ",")).toBe("1.234");
    expect(parseAmount("1,234", ".")).toBe("1234");
    expect(parseAmount("1.234", ".")).toBe("1.234");
    expect(parseAmount("1.234", ",")).toBe("1234");
  });
  it.each(["", "abc", "12a", "1,2,3x", "--5", "€", "."])("rejects %s", (input) => expect(parseAmount(input)).toBeNull());
});

describe("decoding", () => {
  it("strips a UTF-8 BOM", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Libellé;Date")]);
    expect(decodeBytes(bytes)).toEqual({ text: "Libellé;Date", encoding: "utf-8" });
  });
  it("falls back to Windows-1252", () => {
    const bytes = new Uint8Array([0x44, 0xe9, 0x62, 0x69, 0x74, 0x20, 0x80]);
    expect(decodeBytes(bytes)).toEqual({ text: "Débit €", encoding: "windows-1252" });
  });
});

describe("splitRows", () => {
  it("handles quotes, doubled quotes, embedded separators and newlines", () => {
    const rows = splitRows('a;"b;c";"say ""hi""";"two\nlines"\nx;y;z;w', ";");
    expect(rows[0]!.cells).toEqual(["a", "b;c", 'say "hi"', "two\nlines"]);
    expect(rows[1]).toEqual({ cells: ["x", "y", "z", "w"], line: 3 });
  });
  it("drops blank rows and handles CRLF", () => {
    expect(splitRows("a;b\r\n\r\nc;d\r\n;;\r\n", ";").map((r) => r.cells)).toEqual([["a", "b"], ["c", "d"]]);
  });
});

describe("detectSeparator", () => {
  it.each([
    [";", "Date;Libellé;Montant\n01/01/2026;VIR;1 000,50\n02/01/2026;PRLV;-20,00"],
    [",", "Date,Label,Amount\n2026-01-01,Transfer,1000.50\n2026-01-02,Fee,-20.00"],
    ["\t", "Date\tLibellé\tMontant\n01/01/2026\tVIR\t1 000,50\n02/01/2026\tPRLV\t-20,00"],
    ["|", "Date|Libellé|Montant\n01/01/2026|VIR|1000,50\n02/01/2026|PRLV|-20,00"],
  ])("detects %j", (sep, text) => expect(detectSeparator(text)).toBe(sep));

  it("is not fooled by comma decimals in a semicolon file", () => {
    expect(detectSeparator("Date;Libellé;Montant\n01/01/2026;VIR, ACME;1000,50\n02/01/2026;X;2,5")).toBe(";");
  });
  it("copes with a comma file whose amounts are quoted", () => {
    expect(detectSeparator('Date,Libellé,Montant\n01/01/2026,VIR,"1 000,50"\n02/01/2026,PRLV,"-20,00"')).toBe(",");
  });
});

describe("signed amount layout", () => {
  const text = [
    "Date opération;Date valeur;Libellé;Référence;Montant",
    "27/11/2026;28/11/2026;VIR RECU ATLAS DISTRIBUTION FA-2026-00018;REF123;12 600,00",
    "26/11/2026;26/11/2026;COMMISSION TENUE DE COMPTE;;-45,00",
    "",
  ].join("\n");
  it("maps columns and builds lines", () => {
    const { a, b } = run(text);
    expect(a.separator).toBe(";");
    expect(a.headerIndex).toBe(0);
    expect(a.mapping).toMatchObject({ date: 0, label: 2, mode: "signed", amount: 4, reference: 3 });
    expect(b.lines).toEqual([
      { date: "2026-11-27", label: "VIR RECU ATLAS DISTRIBUTION FA-2026-00018", amount: "12600.00", reference: "REF123", line: 2 },
      { date: "2026-11-26", label: "COMMISSION TENUE DE COMPTE", amount: "-45.00", line: 3 },
    ]);
    expect(b).toMatchObject({ received: "12600.00", paidOut: "45.00", from: "2026-11-26", to: "2026-11-27", errors: [] });
  });
});

describe("débit / crédit layout with preamble, Windows-1252 and a totals line", () => {
  const text = [
    "RELEVE DE COMPTE;;;",
    "Compte : 007 780 0001234000456789 12;;;",
    "Période du 01/11/2026 au 30/11/2026;;;",
    "",
    "Date;Libellé;Débit;Crédit",
    "03/11/2026;PRLV ASSURANCE;1 250,00;",
    "04/11/2026;VIR RECU MENUISERIE FASSIA;;66 000,00",
    "05/11/2026;CHEQUE N 4567;  800,00 ;",
    "Total;;2 050,00;66 000,00",
    "",
  ].join("\n");
  it("finds the header past the preamble and nets débit/crédit", () => {
    const bytes = new Uint8Array(Array.from(text, (c) => c.charCodeAt(0) & 0xff));
    const { text: decoded } = decodeBytes(bytes);
    const a = analyze(decoded);
    expect(a.headerIndex).toBe(3);
    expect(a.mapping).toMatchObject({ mode: "split", date: 0, label: 1, debit: 2, credit: 3 });
    const b = buildLines(a);
    expect(b.lines.map((l) => [l.date, l.amount])).toEqual([
      ["2026-11-03", "-1250.00"],
      ["2026-11-04", "66000.00"],
      ["2026-11-05", "-800.00"],
    ]);
    expect(b.ignored).toBe(1);
    expect(b.errors).toEqual([]);
    expect(b.received).toBe("66000.00");
    expect(b.paidOut).toBe("2050.00");
  });
  it("keeps accented labels from a Windows-1252 file", () => {
    const bytes = new Uint8Array(Array.from("Date;Libellé;Montant\n01/11/2026;Règlement électricité;-12,5", (c) => c.charCodeAt(0) & 0xff));
    const { text: decoded, encoding } = decodeBytes(bytes);
    expect(encoding).toBe("windows-1252");
    expect(buildLines(analyze(decoded)).lines[0]!.label).toBe("Règlement électricité");
  });
});

describe("other layouts", () => {
  it("English comma file with dot decimals and ISO dates", () => {
    const { a, b } = run("Date,Description,Amount,Reference\n2026-11-02,Transfer ACME,1250.75,R1\n2026-11-03,Fee,-5.00,\n");
    expect(a.separator).toBe(",");
    expect(a.decimalMark).toBe(".");
    expect(b.lines.map((l) => l.amount)).toEqual(["1250.75", "-5.00"]);
  });
  it("tab separated with two-digit years and dashes", () => {
    const { b } = run("Date\tLibelle\tMontant\n05-11-26\tVIREMENT\t1 000,00\n06-11-26\tPRELEVEMENT\t-300,00");
    expect(b.lines.map((l) => [l.date, l.amount])).toEqual([["2026-11-05", "1000.00"], ["2026-11-06", "-300.00"]]);
  });
  it("quoted fields with embedded separators", () => {
    const { b } = run('Date;Libellé;Montant\n01/11/2026;"VIR; ACME ""SARL""";"1 000,00"');
    expect(b.lines[0]).toMatchObject({ label: 'VIR; ACME "SARL"', amount: "1000.00" });
  });
  it("a file with no header guesses columns from the content", () => {
    const { a, b } = run("01/11/2026;VIREMENT RECU ACME SARL;1 500,00\n02/11/2026;PRELEVEMENT ASSURANCE;-250,00\n03/11/2026;VIREMENT RECU BETA SARL;800,00");
    expect(a.headerIndex).toBeNull();
    expect(a.mapping).toMatchObject({ date: 0, label: 1, mode: "signed", amount: 2 });
    expect(b.lines).toHaveLength(3);
  });
  it("ignores a balance row, even dated", () => {
    const { b } = run("Date;Libellé;Montant\n01/11/2026;SOLDE INITIAL;10 000,00\n02/11/2026;VIR RECU;500,00");
    expect(b.lines).toHaveLength(1);
    expect(b.ignored).toBe(1);
  });
  it("the label falls back to the reference, then to a dash", () => {
    const { b } = run("Date;Libellé;Référence;Montant\n01/11/2026;;CHQ 12;500,00\n02/11/2026;;;300,00");
    expect(b.lines.map((l) => l.label)).toEqual(["CHQ 12", "-"]);
  });
});

describe("malformed input", () => {
  const text = [
    "Date;Libellé;Montant",
    "01/11/2026;OK;100,00",
    "31/02/2026;BAD DATE;100,00",
    "03/11/2026;BAD AMOUNT;abc",
    "04/11/2026;NO AMOUNT;",
    "05/11/2026;ZERO;0,00",
    "pas une date;TEXT;5,00",
    "06/11/2026;GOOD;-20,00",
  ].join("\n");
  it("reports each bad row with its file line and keeps the rest", () => {
    const { b } = run(text);
    expect(b.lines.map((l) => l.line)).toEqual([2, 8]);
    expect(b.errors.map((e) => [e.line, e.code])).toEqual([
      [3, "BAD_DATE"],
      [4, "BAD_AMOUNT"],
      [5, "NO_AMOUNT"],
      [6, "ZERO_AMOUNT"],
      [7, "BAD_DATE"],
    ]);
  });
  it("débit and crédit both empty is an error, both filled nets out", () => {
    const { b } = run("Date;Libellé;Débit;Crédit\n01/11/2026;X;;\n02/11/2026;Y;100,00;30,00");
    expect(b.errors.map((e) => e.code)).toEqual(["NO_AMOUNT"]);
    expect(b.lines[0]!.amount).toBe("-70.00");
  });
  it("empty and garbage input produce no lines and no crash", () => {
    for (const t of ["", "\n\n", "just some words", ";;;;"]) {
      const { b } = run(t);
      expect(b.lines).toEqual([]);
    }
  });
  it("flags files over 2000 lines", () => {
    const rows = Array.from({ length: 2001 }, (_, i) => `01/11/2026;LIGNE ${i};10,00`).join("\n");
    expect(run(`Date;Libellé;Montant\n${rows}`).b.tooMany).toBe(true);
  });
  it("truncates long labels and references to the API limits", () => {
    const { b } = run(`Date;Libellé;Référence;Montant\n01/11/2026;${"x".repeat(400)};${"r".repeat(150)};5,00`);
    expect(b.lines[0]!.label).toHaveLength(300);
    expect(b.lines[0]!.reference).toHaveLength(100);
  });
});
