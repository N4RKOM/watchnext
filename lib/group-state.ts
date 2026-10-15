export type CreateGroupState =
  | { kind: "idle" }
  | { kind: "invalid"; nameError: string }
  | { kind: "error"; message: string }
  | { kind: "created"; name: string; inviteUrl: string; loopback: boolean };

export const initialGroupState: CreateGroupState = { kind: "idle" };
