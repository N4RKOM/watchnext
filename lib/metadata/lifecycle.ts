import type { DatabaseSync } from "node:sqlite";
import { clearTimeout, setTimeout } from "node:timers";

export const metadataColumns = { title: "title", contentType: "content_type", duration: "duration_seconds", sourceUrl: "source_url", watchUrl: "watch_url", coverUrl: "cover_url" } as const;
export type StoredField = keyof typeof metadataColumns | "genres";
export const storedFields: StoredField[] = ["title", "contentType", "duration", "genres", "sourceUrl", "watchUrl", "coverUrl"];

/** Local bounded maintenance, also used before metadata reads. Never accesses a provider. */
export function expireMetadata(db: DatabaseSync, now = new Date(), limit = 250) {
  const time = now.toISOString(), own = !db.isTransaction;
  if (own) db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM metadata_reviews WHERE expires_at<=?").run(time);
    const rows = db.prepare("SELECT title_id,field FROM metadata_fields WHERE origin='provider' AND expires_at<=? AND cleared=0 LIMIT ?").all(time, limit);
    for (const row of rows) {
      const id = row.title_id as string, field = row.field as StoredField;
      if (field === "genres") db.prepare("DELETE FROM title_genres WHERE title_id=?").run(id);
      else db.prepare(`UPDATE titles SET ${metadataColumns[field]}=NULL,metadata_unavailable=1${field === "title" ? ",title_key=NULL" : ""} WHERE id=?`).run(id);
      db.prepare("UPDATE metadata_fields SET cleared=1 WHERE title_id=? AND field=?").run(id, field);
      db.prepare("UPDATE titles SET metadata_unavailable=CASE WHEN title IS NULL OR content_type IS NULL OR duration_seconds IS NULL THEN 1 ELSE 0 END WHERE id=?").run(id);
    }
    const pending = Boolean(db.prepare("SELECT 1 FROM metadata_fields WHERE origin='provider' AND expires_at<=? AND cleared=0 LIMIT 1").get(time));
    if (own) db.exec("COMMIT");
    return { cleared: rows.length, pending };
  } catch (error) { if (own) db.exec("ROLLBACK"); throw error; }
}
export function ensureFreshMetadata(db: DatabaseSync, now = new Date()) {
  if (expireMetadata(db, now).pending) throw new Error("Metadata maintenance is still pending. Retry shortly.");
}
/** Process-local wakeups, not an installed external scheduler. Stop with connection close. */
export function startMetadataMaintenance(db: DatabaseSync) {
  let timer: ReturnType<typeof setTimeout> | undefined, stopped = false;
  const schedule = () => {
    if (stopped || !db.isOpen) return;
    let delay = 30000;
    try {
      const row = db.prepare("SELECT min(expires_at) deadline FROM (SELECT expires_at FROM metadata_fields WHERE origin='provider' AND cleared=0 UNION ALL SELECT expires_at FROM metadata_reviews)").get();
      const deadline = typeof row?.deadline === "string" ? Date.parse(row.deadline) : NaN;
      delay = Number.isFinite(deadline) ? Math.max(1, Math.min(60000, deadline - Date.now())) : 60000;
    } catch { /* A normal guarded read reports storage errors; retry is bounded here. */ }
    timer = setTimeout(() => { if (!stopped && db.isOpen) { try { expireMetadata(db); } catch { /* Retry; never print private storage diagnostics. */ } schedule(); } }, delay);
    timer.unref();
  };
  schedule();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
/** Called inside the edit transaction: only actual corrections change field ownership. */
export function recordCorrections(db: DatabaseSync, id: string, before: Record<string, unknown>, after: Record<string, unknown>) {
  for (const field of storedFields) if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) db.prepare("INSERT INTO metadata_fields(title_id,field,origin) VALUES (?,?,'user') ON CONFLICT(title_id,field) DO UPDATE SET origin='user',retrieved_at=NULL,expires_at=NULL,cleared=0").run(id, field);
}
