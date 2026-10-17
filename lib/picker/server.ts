import type { DatabaseSync } from "node:sqlite";
import { authorizeRequest } from "../request-access";
import { ensureFreshMetadata } from "../metadata/lifecycle";
import { safeExternalUrl } from "../urls";
import { fixedMoods } from "../title-state";
import type { Profile } from "../profile-state";
import { rankCandidates, type RankingInput, type RankingTitle } from "./ranking";
import type { EligibilityProgress } from "./types";
import type { PickerPageView, PickState } from "./view-state";

export function readPickerPage(db: DatabaseSync, request: Request): PickerPageView {
  const context = authorizeRequest(db, request);
  return { groupId: context.groupId, groupName: context.groupName, hasActiveProfile: context.activeMemberId !== null, members: members(db, context.groupId) };
}
function members(db: DatabaseSync, groupId: string): Profile[] {
  return db.prepare("SELECT id,name,avatar_color FROM members WHERE group_id=? ORDER BY created_at,id").all(groupId).map(row => ({ id: row.id as string, name: row.name as string, color: row.avatar_color as string }));
}
function snapshot(db: DatabaseSync, groupId: string) {
  const titles: RankingTitle[] = db.prepare("SELECT id,title,content_type,duration_seconds,numbering_style,archived,created_at FROM titles WHERE group_id=? ORDER BY created_at,id").all(groupId).map(row => ({
    id: row.id as string, groupId, title: row.title as string | null, contentType: row.content_type as string | null,
    durationSeconds: row.duration_seconds as number | null, numberingStyle: row.numbering_style as string, archived: row.archived === 1, createdAt: row.created_at as string,
    moods: db.prepare("SELECT mood_code FROM title_moods WHERE title_id=? ORDER BY mood_code").all(row.id).map(mood => mood.mood_code as string),
  }));
  const progress: EligibilityProgress[] = db.prepare("SELECT title_id,member_id,numbering_style,position_state,next_season,next_episode,completed FROM progress WHERE group_id=?").all(groupId).map(row => ({
    groupId, titleId: row.title_id as string, memberId: row.member_id as string, numberingStyle: row.numbering_style as string,
    positionState: row.position_state as string, nextSeason: row.next_season as number | null, nextEpisode: row.next_episode as number | null, completed: row.completed === 1,
  })); return { titles, progress };
}
const reasonLabels = {
  no_active_titles: "There are no active saved titles to pick from.", progress_required: "Selected viewers need valid next-episode progress.",
  viewer_ineligible: "Completion or different next episodes prevent a shared pick with these settings.", metadata_incomplete: "Some saved titles need usable title, type, duration or mood details.",
  time_mood_excluded: "No viewer-eligible title meets the requested mood/time or permitted alternatives.",
};
/** Current group comes only from session; form group is stale-context detection. No profile required. */
export function pickFromForm(db: DatabaseSync, request: Request, form: FormData, configuredOrigin?: string): PickState {
  const requestId = typeof form.get("requestId") === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(form.get("requestId") as string) ? form.get("requestId") as string : "invalid";
  const claimedGroup = typeof form.get("groupId") === "string" ? form.get("groupId") as string : "";
  const reply = { requestId, groupId: claimedGroup };
  const context = authorizeRequest(db, request, undefined, { mutation: true, configuredOrigin, claimedGroupId: claimedGroup });
  for (const [key] of form) if (!key.startsWith("$ACTION_") && !["requestId", "groupId", "viewers", "availableMinutes", "mood", "rewatches"].includes(key)) return { ...reply, kind: "invalid", errors: { form: "This pick accepts only viewers, time, mood and rewatch permission." } };
  if (requestId === "invalid" || ["requestId", "groupId", "availableMinutes", "mood"].some(key => form.getAll(key).length !== 1)) return { ...reply, kind: "invalid", errors: { form: "The request fields are incomplete or repeated. Review your inputs and try again." } };
  const rewatchValues = form.getAll("rewatches");
  if (rewatchValues.length > 1 || (rewatchValues.length === 1 && rewatchValues[0] !== "yes")) return { ...reply, kind: "invalid", errors: { rewatches: "Use the Rewatches OK checkbox to permit rewatches." } };
  const selected = form.getAll("viewers");
  if (selected.some(value => typeof value !== "string")) return { ...reply, kind: "invalid", errors: { viewers: "Choose valid current group viewers." } };
  db.exec("BEGIN IMMEDIATE");
  try {
    authorizeRequest(db, request, undefined, { mutation: true, configuredOrigin, claimedGroupId: claimedGroup });
    ensureFreshMetadata(db);
    const currentMembers = members(db, context.groupId), data = snapshot(db, context.groupId);
    const input: RankingInput = { groupId: context.groupId, members: currentMembers.map(member => ({ id: member.id, groupId: context.groupId })), ...data,
      selectedViewerIds: selected as string[], availableMinutes: form.get("availableMinutes") as string, mood: form.get("mood") as RankingInput["mood"], rewatches: rewatchValues.length === 1 };
    const result = rankCandidates(input);
    let response: PickState;
    if (result.kind === "invalid_selection") response = { ...reply, kind: "invalid", errors: { viewers: result.message } };
    else if (result.kind === "invalid_input") response = { ...reply, kind: "invalid", errors: { form: result.message } };
    else if (result.kind === "invalid_ranking") response = { ...reply, kind: "invalid", errors: { [result.field === "titles" ? "form" : result.field]: result.message } };
    else if (result.kind === "ranked") {
      const first = result.candidates[0], title = data.titles[first.inputIndex];
      const url = db.prepare("SELECT watch_url FROM titles WHERE id=? AND group_id=?").get(first.titleId, context.groupId)!.watch_url;
      response = { ...reply, kind: "picked", pick: { id: first.titleId, title: title.title!, contentType: title.contentType!, durationSeconds: first.durationSeconds,
        tier: first.tier, message: first.message, target: first.target, watchUrl: safeExternalUrl(url),
        rewatchers: first.rewatchingViewerIds.map(id => currentMembers.find(member => member.id === id)!),
        viewers: selected.map(id => currentMembers.find(member => member.id === id)!), availableMinutes: String(result.context.availableMinutes),
        requestedMood: fixedMoods.find(mood => mood.value === result.context.mood)!.label, rewatches: result.context.rewatches } };
    } else {
      const links: { href: string; label: string }[] = [];
      if (result.actions.includes("add_title")) links.push({ href: context.activeMemberId ? "/watchlist/add" : "/group", label: context.activeMemberId ? "Add a title" : "Choose profile to add a title" });
      if (result.actions.includes("set_progress") || result.actions.includes("complete_metadata")) {
        const affected = result.eligibility.titles.find(item => item.kind === "excluded" && ["unknown_progress", "invalid_progress", "metadata_incomplete"].includes(item.reason) && item.titleId);
        if (affected?.kind === "excluded" && affected.titleId) links.push({ href: `/watchlist/${encodeURIComponent(affected.titleId)}`, label: "View details to review progress or metadata" });
      }
      response = { ...reply, kind: "no_match", message: result.message, reasons: result.reasons.map(reason => reasonLabels[reason]), links };
    }
    db.exec("COMMIT"); return response;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
