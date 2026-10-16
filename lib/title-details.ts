import { ensureFreshMetadata } from "./metadata/lifecycle";
import type { DatabaseSync } from "node:sqlite";
import { authorizeRequest } from "./request-access";
import { safeExternalUrl } from "./urls";
import type { Profile } from "./profile-state";

export type MemberHistory = Profile & { positionState: string | null; nextSeason: number | null; nextEpisode: number | null; timestampSeconds: number | null; completed: boolean | null; rating: number | null; note: string | null };
export type TitleDetails = { id: string; title: string | null; contentType: string | null; durationSeconds: number | null; numberingStyle: string; archived: boolean; canEdit: boolean; activeMemberId: string | null; coverUrl: string | null; sourceUrl: string | null; watchUrl: string | null; providerNamespace: string | null; providerId: string | null; genres: string[]; moods: string[]; contributors: Profile[]; history: MemberHistory[] };

export function readTitleDetails(db: DatabaseSync, request: Request, id: string): TitleDetails {
  const context = authorizeRequest(db, request, { kind: "title", id }); ensureFreshMetadata(db);
  const row = db.prepare("SELECT * FROM titles WHERE id=? AND group_id=?").get(id, context.groupId)!;
  const contributors = db.prepare(`SELECT m.id,m.name,m.avatar_color FROM contributors c JOIN members m ON m.id=c.member_id AND m.group_id=c.group_id
    WHERE c.title_id=? AND c.group_id=? ORDER BY c.created_at,m.id`).all(id, context.groupId)
    .map((r) => ({ id: r.id as string, name: r.name as string, color: r.avatar_color as string }));
  const history = db.prepare(`SELECT m.id,m.name,m.avatar_color,p.position_state,p.next_season,p.next_episode,p.timestamp_seconds,p.completed,r.score,n.body
    FROM members m LEFT JOIN progress p ON p.member_id=m.id AND p.group_id=m.group_id AND p.title_id=?
    LEFT JOIN ratings r ON r.member_id=m.id AND r.group_id=m.group_id AND r.title_id=?
    LEFT JOIN notes n ON n.member_id=m.id AND n.group_id=m.group_id AND n.title_id=?
    WHERE m.group_id=? ORDER BY m.created_at,m.id`).all(id, id, id, context.groupId).map((r) => ({ id: r.id as string, name: r.name as string, color: r.avatar_color as string,
      positionState: r.position_state as string | null, nextSeason: r.next_season as number | null, nextEpisode: r.next_episode as number | null,
      timestampSeconds: r.timestamp_seconds as number | null, completed: r.completed === null ? null : r.completed === 1, rating: r.score as number | null, note: r.body as string | null }));
  return { id, title: row.title as string | null, contentType: row.content_type as string | null, durationSeconds: row.duration_seconds as number | null, numberingStyle: row.numbering_style as string,
    archived: row.archived === 1, canEdit: row.archived === 0 && contributors.some((member) => member.id === context.activeMemberId), activeMemberId: context.activeMemberId, coverUrl: safeExternalUrl(row.cover_url), sourceUrl: safeExternalUrl(row.source_url), watchUrl: safeExternalUrl(row.watch_url),
    providerNamespace: row.provider_namespace as string | null, providerId: row.provider_id as string | null,
    genres: db.prepare("SELECT label FROM title_genres WHERE title_id=? ORDER BY genre_key").all(id).map((r) => r.label as string),
    moods: db.prepare("SELECT m.label FROM title_moods tm JOIN moods m ON m.code=tm.mood_code WHERE tm.title_id=? ORDER BY m.rowid").all(id).map((r) => r.label as string), contributors, history };
}
