import "server-only";

export type PostgrestLikeError =
  | { code?: string; message: string }
  | null
  | undefined;

/**
 * True when the error means "this table/column/function is not there yet",
 * which lets the app degrade gracefully before a migration is applied.
 * PostgREST reports missing tables as PGRST205 ("schema cache") rather than
 * the Postgres 42P01 code.
 */
export function isMissingRelation(error: PostgrestLikeError): boolean {
  if (!error) return false;

  const code = error.code ?? "";
  const message = error.message.toLowerCase();

  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST202" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find the table") ||
    message.includes("could not find the function")
  );
}
