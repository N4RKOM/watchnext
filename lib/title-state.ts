export const contentTypes = [{ value: "movie", label: "Movie" }, { value: "series", label: "Series" }, { value: "anime", label: "Anime" }, { value: "youtube", label: "YouTube video" }] as const;
export const fixedMoods = [{ value: "funny", label: "Funny" }, { value: "relaxing", label: "Relaxing" }, { value: "exciting", label: "Exciting" }, { value: "dark", label: "Dark" }, { value: "emotional", label: "Emotional" }] as const;
export type TitleField = "title" | "contentType" | "minutes" | "seconds" | "numberingStyle" | "genres" | "moods" | "watchUrl";
export type TitleFormState = { kind: "idle" } | { kind: "invalid"; errors: Partial<Record<TitleField, string>> } | { kind: "error"; message: string };
export type SavedTitle = { id: string; title: string; contentType: string; durationSeconds: number; numberingStyle: string; genres: string[]; moods: string[]; watchUrl: string | null; contributors: string[] };
export function durationLabel(seconds: number) { return `${Math.floor(seconds / 60)} min${seconds % 60 ? ` ${seconds % 60} sec` : ""}`; }
