import type { MetadataField, MetadataValues } from "./title-state";
export type EditableTitle = { id: string; revision: string; values: MetadataValues; moods: string[] };
export type EditState = { kind: "idle" } | { kind: "invalid"; errors: Partial<Record<MetadataField, string>> } | { kind: "error" | "stale"; message: string }
  | { kind: "confirmation"; confirmation: string; message: string; title: string };
