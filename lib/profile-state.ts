export const avatarPalette = [
  { name: "Blue", value: "#1d4ed8" }, { name: "Purple", value: "#6d28d9" },
  { name: "Teal", value: "#0f766e" }, { name: "Rose", value: "#be123c" },
  { name: "Amber", value: "#92400e" }, { name: "Slate", value: "#475569" },
] as const;
export type Profile = { id: string; name: string; color: string };
export type ProfileView = { members: Profile[]; activeMemberId: string | null };
export type ProfileState =
  | { kind: "idle" }
  | { kind: "invalid"; errors: { name?: string; color?: string } }
  | { kind: "error"; message: string }
  | ({ kind: "success"; message: string } & ProfileView);
export const initialProfileState: ProfileState = { kind: "idle" };
export function initials(name: string) {
  return name.split(" ").slice(0, 2).map((part) => [...part][0] ?? "").join("").toUpperCase();
}
