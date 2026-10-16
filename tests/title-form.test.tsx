import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TitleForm } from "../app/watchlist/add/title-form";
import type { TitleFormState } from "../lib/title-state";
afterEach(cleanup);
it("labels all fields and switches runtime/numbering for all four content types", () => {
  render(<TitleForm action={async () => ({ kind: "idle" })} />);
  for (const label of ["Title", "Content type", "Minutes", "Seconds (optional)", "Genres (optional)", "External watch link (optional)"]) expect(screen.getByLabelText(label)).toBeTruthy();
  expect(screen.getByRole("group", { name: "Full duration" })).toBeTruthy();
  expect(screen.getAllByRole("checkbox")).toHaveLength(5);
  for (const value of ["series", "anime"]) {
    fireEvent.change(screen.getByLabelText("Content type"), { target: { value } });
    expect(screen.getByRole("group", { name: "Typical episode duration" })).toBeTruthy();
    expect(screen.getByLabelText("Episode numbering")).toBeTruthy();
  }
  fireEvent.change(screen.getByLabelText("Content type"), { target: { value: "youtube" } });
  expect(screen.getByRole("group", { name: "Full duration" })).toBeTruthy(); expect(screen.queryByLabelText("Episode numbering")).toBeNull();
});
it("keeps input and associated validation errors visible", async () => {
  render(<TitleForm action={async () => ({ kind: "invalid", errors: { title: "Collision fixture", moods: "Select a mood" } })} />);
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Retained" } });
  fireEvent.click(screen.getByLabelText("Funny", { exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Save title" })); await screen.findByText("Collision fixture");
  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Retained");
  const mood = screen.getByLabelText("Funny", { exact: true }) as HTMLInputElement;
  fireEvent.reset(mood.form!);
  expect(mood.checked).toBe(true);
  expect(screen.getByLabelText("Title").getAttribute("aria-describedby")).toBe("title-error");
  expect(screen.getByRole("group", { name: "Moods (choose at least one)" }).getAttribute("aria-describedby")).toBe("moods-error");
});
it("disables pending submissions and announces a safe retryable failure", async () => {
  let finish!: (state: TitleFormState) => void;
  const action = vi.fn(() => new Promise<TitleFormState>((resolve) => { finish = resolve; }));
  render(<TitleForm action={action} />);
  fireEvent.click(screen.getByRole("button", { name: "Save title" }));
  const button = await screen.findByRole("button", { name: "Saving title…" }); expect(button.closest("fieldset")?.disabled).toBe(true);
  fireEvent.click(button); expect(action).toHaveBeenCalledTimes(1);
  finish({ kind: "error", message: "Retry fixture" }); await screen.findByRole("alert"); expect(screen.getByRole("button", { name: "Save title" })).toBeTruthy();
});
