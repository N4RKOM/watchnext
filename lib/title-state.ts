export const contentTypes = [{ value: "movie", label: "Movie" }, { value: "series", label: "Series" }, { value: "anime", label: "Anime" }, { value: "youtube", label: "YouTube video" }] as const;
export const fixedMoods = [{ value: "funny", label: "Funny" }, { value: "relaxing", label: "Relaxing" }, { value: "exciting", label: "Exciting" }, { value: "dark", label: "Dark" }, { value: "emotional", label: "Emotional" }] as const;
export type TitleField = "title" | "contentType" | "minutes" | "seconds" | "numberingStyle" | "genres" | "moods" | "watchUrl";
export type TitleFormState = { kind: "idle" } | { kind: "invalid"; errors: Partial<Record<MetadataField, string>> } | { kind: "error"; message: string }
  | { kind: "confirmation" | "restore_confirmation" | "already_added"; id: string; title: string | null; message: string }
  | { kind: "conflict"; id?: string; title?: string | null; message: string };
export type SavedTitle = { id: string; title: string | null; contentType: string | null; durationSeconds: number | null; numberingStyle: string; genres: string[]; moods: string[]; watchUrl: string | null; contributors: string[] };
export function durationLabel(seconds: number | null) { if(seconds === null) return "Duration unavailable"; return `${Math.floor(seconds / 60)} min${seconds % 60 ? ` ${seconds % 60} sec` : ""}`; }
export type MetadataValues = { title: string; contentType: string; minutes: string; seconds: string; numberingStyle: string; genres: string; watchUrl: string; sourceUrl: string; coverUrl: string };
export type MetadataField = keyof MetadataValues | "moods";
