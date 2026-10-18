// @vitest-environment node
import { expect, it } from "vitest";
import { candidateIdentity, createCycleStore, cycleLifetimeMs, type CycleRequest } from "../../lib/picker/cycle";
const base: CycleRequest = { pageId: "page", intentId: "first", intent: "start", cursor: "", owner: "session-group", context: "viewers-time-mood-rewatches", semantic: "dataset", count: 3 };
it("A/B/C advance once, exhaust without wrap, and explicitly restart", () => {
  const store = createCycleStore(); let input = base;
  for (const index of [0, 1, 2, 3]) { const plan = store.plan(input); if (plan.kind !== "position") throw new Error(); expect(plan.index).toBe(index); plan.commit(); input = { ...input, cursor: plan.cursor, intent: "next", intentId: `next-${index}` }; }
  expect(store.plan(input).kind).toBe("conflict"); const restart = store.plan({ ...input, intent: "restart", intentId: "restart" }); expect(restart).toMatchObject({ kind: "position", index: 0 });
});
it("same accepted intent is idempotent, older replay/tamper/wrong owner/context conflict", () => {
  const store = createCycleStore(), first = store.plan(base); if (first.kind !== "position") throw new Error(); first.commit();
  const advance = { ...base, intent: "next" as const, cursor: first.cursor, intentId: "advance" }, next = store.plan(advance); if (next.kind !== "position") throw new Error(); next.commit();
  expect(store.plan(advance)).toMatchObject({ index: 1, cursor: next.cursor }); expect(store.plan(base).kind).toBe("conflict");
  for (const extra of [{ cursor: "tampered" }, { owner: "foreign" }, { context: "different" }, { intent: "start" as const }]) expect(store.plan({ ...advance, ...extra }).kind).toBe("conflict");
});
it("uncommitted failed advance does not consume position; semantic reset is disclosed on retries too", () => {
  const store = createCycleStore(), first = store.plan(base); if (first.kind !== "position") throw new Error(); first.commit();
  const advance = { ...base, intent: "next" as const, cursor: first.cursor, intentId: "advance" };
  expect(store.plan(advance)).toMatchObject({ index: 1 }); expect(store.plan(advance)).toMatchObject({ index: 1 });
  const reset = store.plan({ ...advance, semantic: "changed" }); if (reset.kind !== "position") throw new Error(); expect(reset).toMatchObject({ index: 0, refreshed: true }); reset.commit();
  expect(store.plan({ ...advance, semantic: "changed" })).toMatchObject({ index: 0, refreshed: true, cursor: reset.cursor });
});
it("one candidate exhausts; missing/expired/process-lost state requires explicit new cycle", () => {
  const store = createCycleStore(), first = store.plan({ ...base, count: 1 }, 0); if (first.kind !== "position") throw new Error(); first.commit();
  const next = { ...base, count: 1, cursor: first.cursor, intent: "next" as const, intentId: "next" };
  expect(store.plan(next, 1)).toMatchObject({ index: 1 }); expect(store.plan(next, cycleLifetimeMs).kind).toBe("conflict"); expect(createCycleStore().plan(next).kind).toBe("conflict");
});
it("candidate identity includes explicit target kind/style/coordinates and never display text", () => {
  expect(candidateIdentity("title", { kind: "item" })).not.toBe(candidateIdentity("title", { kind: "episode", numberingStyle: "continuous", nextSeason: null, nextEpisode: 1 }));
  expect(candidateIdentity("title", { kind: "episode", numberingStyle: "season_episode", nextSeason: 1, nextEpisode: 2 })).not.toBe(candidateIdentity("title", { kind: "episode", numberingStyle: "season_episode", nextSeason: 2, nextEpisode: 1 }));
});
it("bounded page retention evicts the oldest context and requires safe restart instead of guessing position", () => {
  const store = createCycleStore(); let oldest = "", newest = "";
  for (let index = 0; index < 513; index++) { const plan = store.plan({ ...base, pageId: `page-${index}` }); if (plan.kind !== "position") throw new Error(); plan.commit(); if (index === 0) oldest = plan.cursor; if (index === 512) newest = plan.cursor; }
  expect(store.plan({ ...base, pageId: "page-0", intent: "next", intentId: "advance", cursor: oldest }).kind).toBe("conflict");
  expect(store.plan({ ...base, pageId: "page-512", intent: "next", intentId: "advance", cursor: newest })).toMatchObject({ kind: "position", index: 1 });
});
