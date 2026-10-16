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
it("offers explicit confirmation, cancels without submitting, preserves fields, and announces already-added", async () => {
  const action = vi.fn().mockResolvedValueOnce({ kind: "confirmation", id: "fixture", title: "Existing work", message: "Confirm fixture" }).mockResolvedValueOnce({ kind: "confirmation", id: "fixture", title: "Existing work", message: "Confirm fixture" }).mockResolvedValueOnce({ kind: "already_added", id: "fixture", title: "Existing work", message: "You already added this title. Nothing was changed." });
  render(<TitleForm action={action} />);
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Existing work" } });fireEvent.click(screen.getByLabelText("Funny", { exact: true }));fireEvent.click(screen.getByRole("button", { name: "Save title" }));await screen.findByRole("button", { name: "Add my name to this title" });
  fireEvent.click(screen.getByRole("button", { name: "Return to editing" }));expect(action).toHaveBeenCalledTimes(1);expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Existing work");expect((screen.getByLabelText("Funny", { exact: true }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Save title" }));fireEvent.click(await screen.findByRole("button", { name: "Add my name to this title" }));await screen.findByText("You already added this title. Nothing was changed.");expect(screen.getByRole("link", { name: "View existing details" }).getAttribute("href")).toBe("/watchlist/fixture");expect(action.mock.calls[2][1].get("intent")).toBe("confirm");expect(action.mock.calls[2][1].get("confirmationId")).toBe("fixture");
});
it("shows unchanged archived/conflict results with honest real detail links", async () => {
  const action=vi.fn().mockResolvedValueOnce({kind:"archived",id:"archive",title:"Archived work",message:"Restoration is not available yet."}).mockResolvedValueOnce({kind:"conflict",id:"existing",message:"Nothing was merged."});
  render(<TitleForm action={action} />);fireEvent.click(screen.getByRole("button",{name:"Save title"}));await screen.findByText("Restoration is not available yet.");expect(screen.getByRole("link",{name:"View archived details"}).getAttribute("href")).toBe("/watchlist/archive");fireEvent.click(screen.getByRole("button",{name:"Save title"}));await screen.findByText("Nothing was merged.");expect(screen.getByRole("link",{name:"View existing details"}).getAttribute("href")).toBe("/watchlist/existing");
});
