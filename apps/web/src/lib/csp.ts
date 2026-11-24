// Content-Security-Policy with a per-request nonce, built in proxy.ts.
// style-src-attr allows 'unsafe-inline' because React server-renders style="…" attributes
// (cachet size, chart bars, progress widths) and a nonce cannot cover attributes; <style>
// elements stay nonce-only. Development adds 'unsafe-eval' (React debugging); production never does.
export function buildCsp(nonce: string, dev = process.env.NODE_ENV === "development"): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${dev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];
  return directives.join("; ");
}
