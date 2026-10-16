import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RatingControls } from "../app/watchlist/rating-controls";
import { DetailView } from "../app/watchlist/[id]/detail-view";
import type { RatingState } from "../lib/rating-state";
import type { TitleDetails } from "../lib/title-details";
afterEach(cleanup);
const member = { id: "anna", name: "Anna", color: "#1d4ed8" };
const detail: TitleDetails = { id: "title", title: "Series", contentType: "series", durationSeconds: 1440, numberingStyle: "continuous", archived: false, canEdit: false, activeMemberId: "anna", coverUrl: null, sourceUrl: null, watchUrl: null, providerNamespace: null, providerId: null, genres: [], moods: [], contributors: [], history: [{ ...member, positionState: null, nextSeason: null, nextEpisode: null, timestampSeconds: null, completed: null, rating: 8, note: null }, { ...member, id: "max", name: "Max", color: "#0f766e", positionState: null, nextSeason: null, nextEpisode: null, timestampSeconds: null, completed: null, rating: null, note: null }] };
it("honestly shows Not rated with real identity, whole-title/group visibility and independent completion guidance", () => {
  const action = vi.fn(async (): Promise<RatingState> => ({ kind: "idle" })); render(<RatingControls member={member} score={null} action={action} />);
  expect((screen.getByLabelText("Rating (1–10)") as HTMLInputElement).value).toBe(""); expect(screen.getByText("Your saved rating: Not rated.")).toBeTruthy(); expect(screen.getByText(/whole title, including a series or anime/)).toBeTruthy(); expect(screen.getByText("Anna")).toBeTruthy(); expect(action).not.toHaveBeenCalled();
});
it("associates validation and retains score on validation/storage errors", async () => {
  let calls = 0; render(<RatingControls member={member} score={8} action={async () => ++calls === 1 ? { kind: "invalid", error: "Use whole numbers 1–10.", message: "Check rating." } : { kind: "error", message: "Please try again." }} />);
  fireEvent.change(screen.getByLabelText("Rating (1–10)"), { target: { value: "7.5" } }); fireEvent.click(screen.getByText("Save rating")); await screen.findByText("Use whole numbers 1–10."); expect(screen.getByLabelText("Rating (1–10)").getAttribute("aria-invalid")).toBe("true"); expect(screen.getByLabelText("Rating (1–10)").getAttribute("aria-describedby")).toContain("rating-error");
  fireEvent.click(screen.getByText("Save rating")); await screen.findByText("Please try again."); expect((screen.getByLabelText("Rating (1–10)") as HTMLInputElement).value).toBe("7.5");
});
it("pending disables duplicates and clear success resets to Not rated rather than falling back to the old score", async () => {
  let release!: (state: RatingState) => void; render(<RatingControls member={member} score={8} action={() => new Promise(done => { release = done; })} />);
  fireEvent.click(screen.getByText("Clear my rating")); await screen.findByText("Saving your rating…"); expect(screen.getByText("Save rating").matches(":disabled")).toBe(true);
  await act(async () => release({ kind: "saved", rating: { memberId: member.id, score: null }, message: "Your rating is cleared. Not rated." }));
  expect((screen.getByLabelText("Rating (1–10)") as HTMLInputElement).value).toBe(""); expect(screen.getByText("Your saved rating: Not rated.")).toBeTruthy();
});
it("group-only viewers see real attributed history and profile action; archive is read-only and nullable metadata remains rateable", () => {
  const action = async (): Promise<RatingState> => ({ kind: "idle" }); const view = render(<DetailView detail={{ ...detail, activeMemberId: null }} ratingAction={action} />);
  expect(screen.getByRole("link", { name: "Choose profile" }).getAttribute("href")).toBe("/group"); expect(within(screen.getByRole("article", { name: "Anna" })).getByText("Rating: 8/10")).toBeTruthy(); expect(within(screen.getByRole("article", { name: "Max" })).getByText("Rating: Not rated")).toBeTruthy();
  view.rerender(<DetailView detail={{ ...detail, archived: true }} ratingAction={action} />); expect(screen.queryByText("Save rating")).toBeNull(); expect(screen.getByText("Rating: 8/10")).toBeTruthy();
  view.rerender(<DetailView detail={{ ...detail, title: null, contentType: null, durationSeconds: null }} ratingAction={action} episodeAction={async () => ({ kind: "idle" })} />); expect(screen.getByText("Save rating")).toBeTruthy(); expect(screen.getByText("Your episode progress")).toBeTruthy();
});
