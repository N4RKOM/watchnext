import { ensureFreshMetadata } from "./metadata/lifecycle";
import type { DatabaseSync } from "node:sqlite";
import { authorizeRequest } from "./request-access";
import type { Profile } from "./profile-state";
import { safeExternalUrl } from "./urls";

export type WatchlistItem = { id: string; title: string | null; contentType: string | null; durationSeconds: number | null; numberingStyle: string; coverUrl: string | null; moods: string[]; contributors: Profile[] };
export type WatchlistView = { activeMemberId: string | null; items: WatchlistItem[] };

/** Group access permits browsing even before a profile is selected. */
export function readWatchlist(db: DatabaseSync, request: Request, archived = false): WatchlistView {
  const context = authorizeRequest(db, request); ensureFreshMetadata(db);
  const items: WatchlistItem[] = db.prepare("SELECT id,title,content_type,duration_seconds,numbering_style,cover_url FROM titles WHERE group_id=? AND archived=? ORDER BY created_at DESC,id ASC")
    .all(context.groupId, Number(archived)).map((row) => ({ id: row.id as string, title: row.title as string | null, contentType: row.content_type as string | null,
      durationSeconds: row.duration_seconds as number | null, numberingStyle: row.numbering_style as string, coverUrl: safeExternalUrl(row.cover_url), moods: [], contributors: [] }));
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const row of db.prepare(`SELECT tm.title_id,m.label FROM title_moods tm JOIN moods m ON m.code=tm.mood_code
    JOIN titles t ON t.id=tm.title_id WHERE t.group_id=? AND t.archived=? ORDER BY m.rowid`).all(context.groupId, Number(archived))) byId.get(row.title_id as string)!.moods.push(row.label as string);
  for (const row of db.prepare(`SELECT c.title_id,m.id,m.name,m.avatar_color FROM contributors c
    JOIN members m ON m.id=c.member_id AND m.group_id=c.group_id JOIN titles t ON t.id=c.title_id AND t.group_id=c.group_id
    WHERE t.group_id=? AND t.archived=? ORDER BY c.created_at,m.id`).all(context.groupId, Number(archived))) byId.get(row.title_id as string)!.contributors.push({ id: row.id as string, name: row.name as string, color: row.avatar_color as string });
  return { activeMemberId: context.activeMemberId, items };
}
