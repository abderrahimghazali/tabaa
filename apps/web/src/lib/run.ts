import "server-only";
import { revalidatePath } from "next/cache";
import { ApiFailure } from "./api";
import { getLocale } from "./locale";
import { makeT } from "./i18n";
import type { Result } from "./result";

/** Runs an API call for a server action: revalidates the app and turns API failures into a Result. */
export async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn();
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof ApiFailure) {
      if (e.error.code === "FORBIDDEN") {
        return { ok: false, error: { ...e.error, message: makeT(await getLocale())("error.forbidden") } };
      }
      return { ok: false, error: e.error };
    }
    throw e;
  }
}
