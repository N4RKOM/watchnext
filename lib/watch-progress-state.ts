export type WatchProgress = { memberId: string; numberingStyle: "none"; recorded: boolean; timestampSeconds: number | null; completed: boolean; fullDurationSeconds: number | null; runtimeAvailable: boolean; beyondDuration: boolean };
export type WatchState = { kind: "idle" | "saved" | "invalid" | "error"; message?: string; error?: string; progress?: WatchProgress };
export type WatchAction = (previous: WatchState, form: FormData) => Promise<WatchState>;
export function usableRuntime(duration: number | null): duration is number { return duration !== null && Number.isInteger(duration) && duration >= 1 && duration <= 86400; }
export function formatWatchTimestamp(seconds: number | null): string {
  if (seconds === null) return "";
  if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error("A timestamp must contain nonnegative whole seconds");
  const pad = (value: number) => String(value).padStart(2, "0");
  return seconds >= 3600 ? `${Math.floor(seconds / 3600)}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}` : `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`;
}
/** Full duration is retained independently; no remaining-time value is derived here. */
export function projectWatchProgress(memberId: string, fullDurationSeconds: number | null, row: { timestampSeconds: number | null; completed: boolean | null } | null): WatchProgress {
  const timestampSeconds = row?.timestampSeconds ?? null, runtimeAvailable = usableRuntime(fullDurationSeconds);
  return { memberId, numberingStyle: "none", recorded: row !== null && row.completed !== null, timestampSeconds, completed: row?.completed ?? false, fullDurationSeconds, runtimeAvailable, beyondDuration: timestampSeconds !== null && runtimeAvailable && timestampSeconds > fullDurationSeconds };
}
