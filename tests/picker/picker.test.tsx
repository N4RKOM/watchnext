import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Picker, PickResult } from "../../app/pick/picker";
import type { PickerPageView, PickState, PickView } from "../../lib/picker/view-state";
const anna = { id: "anna", name: "Anna", color: "#1d4ed8" }, max = { id: "max", name: "Max", color: "#0f766e" };
const view: PickerPageView = { groupId: "group", groupName: "Our group", members: [anna, max], hasActiveProfile: false };
const pick: PickView = { id: "title", title: "Real title", contentType: "series", durationSeconds: 1500, tier: "exact", message: "Matches your mood and fits your available time.", target: { kind: "episode", numberingStyle: "season_episode", nextSeason: 2, nextEpisode: 3, restart: false, catchUp: true }, rewatchers: [max], viewers: [anna, max], availableMinutes: "25", requestedMood: "Funny", rewatches: true, watchUrl: "https://example.com/series" };
afterEach(cleanup);
function fill() { fireEvent.click(screen.getByRole("checkbox", { name: "Anna" })); fireEvent.change(screen.getByLabelText("Available time (whole minutes)"), { target: { value: "25" } }); fireEvent.change(screen.getByLabelText("Mood"), { target: { value: "funny" } }); }
function reply(form: FormData, extra: Record<string, unknown> = {}): PickState { return { kind: "picked", groupId: form.get("groupId") as string, requestId: form.get("requestId") as string, pick, ...extra } as PickState; }
it("starts with no invented viewers/time/mood, rewatches off and profile-aware real actions", () => {
  render(<Picker view={view} action={async () => ({ kind: "idle" })} />); expect((screen.getByRole("checkbox", { name: "Anna" }) as HTMLInputElement).checked).toBe(false); expect((screen.getByLabelText("Rewatches OK") as HTMLInputElement).checked).toBe(false);
  expect((screen.getByLabelText("Mood") as HTMLSelectElement).value).toBe(""); expect((screen.getByLabelText("Available time (whole minutes)") as HTMLInputElement).value).toBe(""); expect(screen.getByRole("link", { name: "Choose profile to add a title" }).getAttribute("href")).toBe("/group"); expect(screen.queryByText("Pick again")).toBeNull();
});
it("no members has honest create-profile action and no fake pick form", () => {
  render(<Picker view={{ ...view, members: [] }} action={async () => ({ kind: "idle" })} />); expect(screen.getByRole("link", { name: "Create a profile" }).getAttribute("href")).toBe("/group"); expect(screen.queryByRole("button", { name: "Pick for me" })).toBeNull();
});
it("submits explicit fields, displays one result and hides all old result links on edits", async () => {
  const action = vi.fn(async (form: FormData) => reply(form)); render(<Picker view={view} action={action} />); fill(); fireEvent.click(screen.getByRole("button", { name: "Pick for me" })); await screen.findByRole("heading", { name: "Real title" });
  expect(action.mock.calls[0][0].getAll("viewers")).toEqual(["anna"]); expect(action.mock.calls[0][0].has("rewatches")).toBe(false); expect(screen.getAllByRole("link", { name: "View details" }).length).toBe(1);
  fireEvent.change(screen.getByLabelText("Available time (whole minutes)"), { target: { value: "24" } }); expect(screen.queryByRole("link", { name: "View details" })).toBeNull(); expect(screen.queryByRole("link", { name: "Open series (external)" })).toBeNull();
});
it("edited inputs reject delayed prior response; pending blocks duplicate submit and preserves controls", async () => {
  let release!: (state: PickState) => void, submitted!: FormData; const action = vi.fn((form: FormData) => { submitted = form; return new Promise<PickState>(done => { release = done; }); });
  render(<Picker view={view} action={action} />); fill(); fireEvent.click(screen.getByRole("button", { name: "Pick for me" })); expect(screen.getByRole("button", { name: "Finding a pick…" }).matches(":disabled")).toBe(true);
  expect(screen.getByText("Finding a pick for Anna · 25 minutes · Funny · Rewatches off…")).toBeTruthy();
  fireEvent.submit(screen.getByRole("button", { name: "Finding a pick…" }).closest("form")!); expect(action).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText("Mood"), { target: { value: "dark" } }); await act(async () => release(reply(submitted))); expect(screen.queryByText("Real title")).toBeNull(); expect((screen.getByLabelText("Mood") as HTMLSelectElement).value).toBe("dark");
});
it("group context change prevents previous response from restoring links", async () => {
  let release!: (state: PickState) => void, submitted!: FormData; const action = (form: FormData) => { submitted = form; return new Promise<PickState>(done => { release = done; }); };
  const rendered = render(<Picker view={view} action={action} />); fill(); fireEvent.click(screen.getByRole("button", { name: "Pick for me" })); rendered.rerender(<Picker view={{ ...view, groupId: "new-group", groupName: "New group" }} action={action} />);
  await act(async () => release(reply(submitted))); expect(screen.queryByText("Real title")).toBeNull(); expect((screen.getByRole("checkbox", { name: "Anna" }) as HTMLInputElement).checked).toBe(false);
});
it("delayed rejected request cannot replace edited input with an old error", async () => {
  let reject!: (reason: Error) => void; render(<Picker view={view} action={() => new Promise((_resolve, fail) => { reject = fail; })} />); fill(); fireEvent.click(screen.getByRole("button", { name: "Pick for me" }));
  fireEvent.change(screen.getByLabelText("Available time (whole minutes)"), { target: { value: "18" } }); await act(async () => reject(new Error("old network error")));
  expect(screen.queryByText(/We couldn’t pick right now/)).toBeNull(); expect((screen.getByLabelText("Available time (whole minutes)") as HTMLInputElement).value).toBe("18");
});
it("mismatched request identifier never creates actionable links", async () => {
  render(<Picker view={view} action={async form => reply(form, { requestId: "unrelated-request" })} />); fill(); fireEvent.click(screen.getByRole("button", { name: "Pick for me" }));
  await act(async () => {}); expect(screen.queryByRole("link", { name: "View details" })).toBeNull();
});
it("safe errors retain values and allow fresh retry; validation associates its field", async () => {
  const action = vi.fn(async (form: FormData) => reply(form, { kind: "invalid", errors: { availableMinutes: "Enter whole minutes" } })); render(<Picker view={view} action={action} />); fill(); fireEvent.click(screen.getByRole("button", { name: "Pick for me" })); await screen.findByText("Enter whole minutes"); expect(screen.getByLabelText("Available time (whole minutes)").getAttribute("aria-invalid")).toBe("true");
  action.mockImplementationOnce(async () => { throw new Error("network failure"); }); fireEvent.click(screen.getByRole("button", { name: "Pick for me" })); await screen.findByText(/We couldn’t pick right now/); expect((screen.getByLabelText("Available time (whole minutes)") as HTMLInputElement).value).toBe("25"); expect((screen.getByRole("checkbox", { name: "Anna" }) as HTMLInputElement).checked).toBe(true);
  action.mockImplementationOnce(async form => reply(form)); fireEvent.click(screen.getByRole("button", { name: "Pick for me" })); await screen.findByRole("heading", { name: "Real title" }); expect(action).toHaveBeenCalledTimes(3);
});
it("result shows exact seasonal/rewatching context and safe external/detail links without fabricated episode URL", () => {
  render(<PickResult pick={pick} />); expect(screen.getByText("Season 2, episode 3")).toBeTruthy(); expect(screen.getByText("Typical episode duration: 25 min", { exact: false })).toBeTruthy(); const external = screen.getByRole("link", { name: "Open series (external)" }); expect(external.getAttribute("href")).toBe("https://example.com/series"); expect(external.getAttribute("target")).toBe("_blank"); expect(external.getAttribute("rel")).toBe("noopener noreferrer"); expect(screen.getByRole("link", { name: "View details" }).getAttribute("href")).toBe("/watchlist/title");
});
it("fallback/restart/missing-link copy is honest and no-match actions are real", async () => {
  const rendered = render(<PickResult pick={{ ...pick, tier: "over_budget", message: "1 second longer than your available time.", watchUrl: null, target: { kind: "episode", numberingStyle: "continuous", nextSeason: null, nextEpisode: 1, restart: true, catchUp: false } }} />);
  expect(screen.getByText("Alternative suggestion")).toBeTruthy(); expect(screen.getByText("1 second longer than your available time.")).toBeTruthy(); expect(screen.getByText("Restart from the first episode.")).toBeTruthy(); expect(screen.queryByRole("link", { name: "Open series (external)" })).toBeNull(); expect(screen.getByText("No viewing link saved.")).toBeTruthy(); rendered.unmount();
  render(<Picker view={view} action={async form => reply(form, { kind: "no_match", message: "No saved items", reasons: ["No active titles"], links: [{ href: "/group", label: "Choose profile to add a title" }] })} />); fill(); fireEvent.click(screen.getByRole("button", { name: "Pick for me" })); await screen.findByRole("heading", { name: "No match" }); expect(screen.getByText("Your settings haven’t changed.", { exact: false })).toBeTruthy();
});
