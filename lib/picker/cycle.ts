import { createHash, randomBytes } from "node:crypto";
export const cycleLifetimeMs = 30 * 60 * 1000;
const capacity = 512;
export const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type CycleIntent = "start" | "next" | "restart";
type LastIntent = { id: string; intent: CycleIntent; inputCursor: string; index: number; outputCursor: string; refreshed: boolean };
type PageCycle = { owner: string; context: string; semantic: string; index: number; cursor: string; expiresAt: number; last: LastIntent };
export type CycleRequest = { pageId: string; intentId: string; intent: CycleIntent; cursor: string; owner: string; context: string; semantic: string; count: number };
export type CyclePlan = { kind: "conflict"; message: string } | { kind: "position"; index: number; cursor: string; refreshed: boolean; commit: () => void };
export function createCycleStore() {
  const pages = new Map<string, PageCycle>();
  return {
    plan(input: CycleRequest, now = Date.now()): CyclePlan {
      for (const [key, value] of pages) if (value.expiresAt <= now) pages.delete(key);
      const current = pages.get(input.pageId), conflict = (): CyclePlan => ({ kind: "conflict", message: "This picking cycle expired or changed. Start a new cycle to continue safely." });
      if (current && current.owner !== input.owner) return conflict();
      const repeated = current?.last.id === input.intentId;
      if (repeated && (current!.context !== input.context || current!.last.intent !== input.intent || current!.last.inputCursor !== input.cursor)) return conflict();
      if (!current && (input.intent !== "start" || input.cursor)) return conflict();
      if (current && !repeated && (current.context !== input.context || input.intent === "start" || input.cursor !== current.cursor)) return conflict();
      const changed = Boolean(current && current.semantic !== input.semantic), refreshed = changed || Boolean(repeated && current!.last.refreshed);
      if (current && !repeated && !refreshed && (input.intent === "restart" ? current.index < input.count : current.index >= input.count)) return conflict();
      const index = !current || changed || input.intent === "restart" ? 0 : repeated ? current.last.index : current.index + 1;
      const cursor = repeated && !changed ? current!.last.outputCursor : randomBytes(32).toString("base64url");
      const draft: PageCycle = { owner: input.owner, context: input.context, semantic: input.semantic, index, cursor,
        expiresAt: current?.expiresAt ?? now + cycleLifetimeMs, last: { id: input.intentId, intent: input.intent, inputCursor: input.cursor, index, outputCursor: cursor, refreshed } };
      return { kind: "position", index, cursor, refreshed, commit: () => {
        if (!pages.has(input.pageId) && pages.size >= capacity) pages.delete(pages.keys().next().value!);
        pages.set(input.pageId, draft);
      } };
    },
  };
}
export const pageCycles = createCycleStore();
export function candidateIdentity(titleId: string, target: { readonly kind: "item" } | { readonly kind: "episode"; readonly numberingStyle: string; readonly nextSeason: number | null; readonly nextEpisode: number }) {
  return JSON.stringify(target.kind === "item" ? [titleId, "item"] : [titleId, "episode", target.numberingStyle, target.nextSeason, target.nextEpisode]);
}
