import type { DatabaseSync } from "node:sqlite";
import { authorizeRequest } from "./request-access";
import { requireTitleMember } from "./title-access";
import { AccessError } from "./sessions";
import { ensureFreshMetadata } from "./metadata/lifecycle";
import { episodeStyle, projectEpisodeProgress, type EpisodeField } from "./episode-progress-state";

export class EpisodeFieldError extends Error { constructor(public field: EpisodeField, message: string) { super(message); } }
function currentTitle(db: DatabaseSync, request: Request, id: string, input?: Record<string, unknown>, configuredOrigin?: string) {
  if (input && (typeof input.memberId !== "string" || !input.memberId)) throw new AccessError();
  const context = requireTitleMember(db, request, { mutation: Boolean(input), memberId: input?.memberId, groupId: input?.groupId, configuredOrigin });
  authorizeRequest(db, request, { kind: "title", id }, { mutation: Boolean(input), configuredOrigin });
  ensureFreshMetadata(db);
  const row = db.prepare("SELECT numbering_style,content_type,archived FROM titles WHERE id=? AND group_id=?").get(id, context.groupId)!;
  if (!episodeStyle(row.numbering_style as string) || (row.content_type !== null && !["series", "anime"].includes(row.content_type as string))) throw new AccessError();
  if (input && (row.archived !== 0 || input.numberingStyle !== row.numbering_style)) throw new AccessError();
  return { ...context, numberingStyle: row.numbering_style as "season_episode" | "continuous" };
}
export function readOwnEpisodeProgress(db: DatabaseSync, request: Request, id: string) {
  const context = currentTitle(db, request, id);
  const row = db.prepare("SELECT position_state,next_season,next_episode,completed FROM progress WHERE title_id=? AND group_id=? AND member_id=?").get(id, context.groupId, context.activeMemberId!);
  return projectEpisodeProgress(context.activeMemberId!, context.numberingStyle, row ? { positionState: row.position_state as string, nextSeason: row.next_season as number | null, nextEpisode: row.next_episode as number | null, completed: row.completed === 1 } : null);
}
function coordinate(value: unknown, field: "nextSeason" | "nextEpisode") {
  if (typeof value !== "string" || !/^[0-9]{1,4}$/.test(value.trim()) || Number(value.trim()) < 1 || Number(value.trim()) > 9999) throw new EpisodeFieldError(field, "Enter a whole number from 1 to 9999, using digits only.");
  return Number(value.trim());
}
function absent(value: unknown) { return value === undefined || value === ""; }
/** Current session owns the row; displayed member/style are stale-form checks only. */
export function updateEpisodeProgress(db: DatabaseSync, request: Request, id: string, input: Record<string, unknown>, configuredOrigin?: string) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const context = currentTitle(db, request, id, input, configuredOrigin);
    if (Object.keys(input).some(key => !["intent", "memberId", "groupId", "numberingStyle", "positionState", "nextSeason", "nextEpisode"].includes(key))) throw new EpisodeFieldError("positionState", "This episode operation accepts only episode progress, not timestamps or other fields.");
    if (!["save_position", "complete", "undo_completion"].includes(input.intent as string)) throw new EpisodeFieldError("positionState", "Choose Save episode progress, Mark complete or Undo completion.");
    if (input.intent === "save_position") {
      if (!["unknown", "not_started", "in_progress"].includes(input.positionState as string)) throw new EpisodeFieldError("positionState", "Choose Unknown, Not started or In progress.");
      let season: number | null = null, episode: number | null = null;
      if (input.positionState === "in_progress") {
        episode = coordinate(input.nextEpisode, "nextEpisode");
        if (context.numberingStyle === "season_episode") season = coordinate(input.nextSeason, "nextSeason");
        else if (!absent(input.nextSeason)) throw new EpisodeFieldError("nextSeason", "Continuous numbering does not have a season. Reload this title’s progress.");
      } else {
        if (!absent(input.nextSeason)) throw new EpisodeFieldError("nextSeason", "Only In progress accepts entered coordinates.");
        if (!absent(input.nextEpisode)) throw new EpisodeFieldError("nextEpisode", "Only In progress accepts entered coordinates.");
        if (input.positionState === "not_started") { episode = 1; season = context.numberingStyle === "season_episode" ? 1 : null; }
      }
      db.prepare(`INSERT INTO progress(group_id,title_id,member_id,numbering_style,position_state,next_season,next_episode) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(title_id,member_id) DO UPDATE SET position_state=excluded.position_state,next_season=excluded.next_season,next_episode=excluded.next_episode`)
        .run(context.groupId, id, context.activeMemberId!, context.numberingStyle, input.positionState as string, season, episode);
    } else {
      // Completion ignores unsaved position inputs and updates only the independent flag.
      db.prepare(`INSERT INTO progress(group_id,title_id,member_id,numbering_style,completed) VALUES (?,?,?,?,?)
        ON CONFLICT(title_id,member_id) DO UPDATE SET completed=excluded.completed`)
        .run(context.groupId, id, context.activeMemberId!, context.numberingStyle, input.intent === "complete" ? 1 : 0);
    }
    const result = readOwnEpisodeProgress(db, request, id);
    db.exec("COMMIT"); return result;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
