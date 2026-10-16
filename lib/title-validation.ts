import { contentTypes, fixedMoods, type TitleField } from "./title-state";
import { safeExternalUrl } from "./urls";
export class TitleFieldError extends Error {
  constructor(public field: TitleField, message: string) { super(message); }
}
export class TitleCollisionError extends TitleFieldError {
  constructor() { super("title", "A title with this name and type is already saved, including archived titles. For a different work, add a distinguishing detail such as its year. Nothing was changed."); }
}
export type ManualTitleInput = Record<TitleField, unknown> & { groupId?: unknown; memberId?: unknown };
const fail = (field: TitleField, message: string): never => { throw new TitleFieldError(field, message); };
function text(value: unknown, field: TitleField) { return typeof value === "string" ? value.trim() : fail(field, "Enter text in this field."); }
export function validateManualTitle(input: ManualTitleInput) {
  const title = text(input.title, "title");
  if (!title || title.includes("\0") || [...title].length > 200) fail("title", "Enter a title with 1–200 characters and no unsupported characters.");
  const titleKey = title.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
  if (!titleKey) fail("title", "Enter a title with 1–200 characters.");
  const contentType = text(input.contentType, "contentType");
  if (!contentTypes.some((type) => type.value === contentType)) fail("contentType", "Choose Movie, Series, Anime, or YouTube video.");
  const component = (value: unknown, field: "minutes" | "seconds", maximum: number, optional = false) => {
    const raw = text(value, field);
    if (optional && raw === "") return 0;
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > maximum) fail(field, `Enter whole ${field} from 0 to ${maximum}.`);
    return Number(raw);
  };
  const minutes = component(input.minutes, "minutes", 1440), seconds = component(input.seconds, "seconds", 59, true);
  const durationSeconds = minutes * 60 + seconds;
  if (durationSeconds < 1 || durationSeconds > 86400) fail("minutes", "Total duration must be from 1 second to 1440 minutes (24 hours).");
  const numberingStyle = text(input.numberingStyle, "numberingStyle");
  const episodic = contentType === "series" || contentType === "anime";
  if (!(episodic ? ["season_episode", "continuous"] : ["none"]).includes(numberingStyle)) fail("numberingStyle", episodic ? "Choose Season + episode or Continuous numbering." : "Movies and videos do not use episode numbering.");
  if (!Array.isArray(input.moods) || input.moods.length === 0 || input.moods.some((value) => !fixedMoods.some((mood) => mood.value === value))) fail("moods", "Choose at least one of the five available moods.");
  const moods = [...new Set(input.moods as string[])];
  const rawGenres = text(input.genres, "genres");
  const genres = new Map<string, string>();
  if (rawGenres) for (const part of rawGenres.split(",")) {
    const label = part.trim();
    if (!label || [...label].length > 40 || label.includes("\0")) fail("genres", "Use comma-separated genres with 1–40 characters each, up to ten distinct genres.");
    if (!genres.has(label.toLowerCase())) genres.set(label.toLowerCase(), label);
  }
  if (genres.size > 10) fail("genres", "Use no more than ten distinct genres.");
  const rawUrl = text(input.watchUrl, "watchUrl");
  let watchUrl: string | null = null;
  if (rawUrl) {
    watchUrl = safeExternalUrl(rawUrl);
    if (!watchUrl) fail("watchUrl", "Enter a complete HTTP or HTTPS link without a username or password, or leave it blank.");
  }
  return { title, titleKey, contentType, durationSeconds, numberingStyle, moods, genres, watchUrl };
}
