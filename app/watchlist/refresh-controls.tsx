"use client";
import { useActionState } from "react";
export type RefreshState = { kind: "idle" | "done" | "error"; message?: string };
export function RefreshControls({ action }: { action: (previous: RefreshState, form: FormData) => Promise<RefreshState> }) {
  const [state, submit, pending] = useActionState(action, { kind: "idle" });
  return <form action={submit}><button className="button button-secondary" disabled={pending} type="submit">{pending ? "Refreshing metadata…" : "Refresh imported metadata"}</button><p role={state.kind === "error" ? "alert" : "status"}>{pending ? "Checking the metadata provider…" : state.message}</p></form>;
}
