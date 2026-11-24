import type { ApiError } from "@facture/core";

export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export function normalizePath(path: string): string {
  // The API prefixes invoice fields with "invoice."; form fields are keyed without it.
  return path.replace(/\[(\d+)\]/g, ".$1").replace(/^\./, "").replace(/^invoice\./, "");
}

export function issuesAt(error: ApiError | null | undefined, path: string): string | undefined {
  const want = normalizePath(path);
  return error?.issues?.find((i) => normalizePath(i.path) === want)?.message;
}
