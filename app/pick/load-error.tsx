"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
export function PickerLoadError() {
  const router = useRouter(), [pending, start] = useTransition();
  return <div className="page-content"><h1>Pick for me</h1><section className="placeholder"><h2>Couldn’t load your group</h2><p>Try again to choose viewers. Your saved titles haven’t changed.</p><button className="button" disabled={pending} onClick={() => start(() => router.refresh())}>{pending ? "Loading…" : "Try again"}</button></section></div>;
}
