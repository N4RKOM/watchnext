import { resolveAppOrigin } from "../groups";
import { AuthError } from "./security";

export function requireAccountPost(request: Request, configuredOrigin?: string) {
  if (request.method !== "POST" || request.headers.get("origin") !== resolveAppOrigin(configuredOrigin).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new AuthError("This request isn’t allowed. Open WatchNext at its configured address and try again.");
}
export async function accountBody(request: Request, operation: string): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new AuthError("Submit the form again.");
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError("Submit the form again.");
  let size = 0; const chunks: Uint8Array[] = [];
  let expired = false;
  const timer = setTimeout(() => { expired = true; void reader.cancel().catch(() => {}); }, 10_000);
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new AuthError("The submitted fields are too long."); }
      chunks.push(part.value);
    }
    if (expired) throw new AuthError("The form took too long to arrive. Submit it again.");
  } finally { clearTimeout(timer); reader.releaseLock(); }
  let input: unknown;
  try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new AuthError("Submit the form again."); }
  const allowed = operation === "group-create" ? ["groupName","revision"] : operation === "group-switch" ? ["groupId","revision"] : operation === "group-join" || operation === "group-legacy" ? ["revision"] : operation === "register" ? ["username", "password", "confirmation"] : operation === "recover" ? ["username", "recoveryCode", "password", "confirmation"] : operation === "login" ? ["username", "password"] : [];
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) throw new AuthError("Submit the form again.");
  return input as Record<string, unknown>;
}
