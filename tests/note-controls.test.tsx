import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NoteControls } from "../app/watchlist/note-controls";
import { DetailView } from "../app/watchlist/[id]/detail-view";
import type { NoteState } from "../lib/note-state";
import type { TitleDetails } from "../lib/title-details";
afterEach(cleanup);
const member = { id: "anna", name: "Anna", color: "#1d4ed8" };
const hostile = '<script>window.noteExecuted=true</script>\n**plain** [link](https://example.com)';
const detail: TitleDetails = { id: "title", title: "Series", contentType: "series", durationSeconds: 1440, numberingStyle: "continuous", archived: false, canEdit: false, activeMemberId: "anna", coverUrl: null, sourceUrl: null, watchUrl: null, providerNamespace: null, providerId: null, genres: [], moods: [], contributors: [], history: [{ ...member, positionState: null, nextSeason: null, nextEpisode: null, timestampSeconds: null, completed: null, rating: 8, note: hostile }, { ...member, id: "max", name: "Max", color: "#0f766e", positionState: null, nextSeason: null, nextEpisode: null, timestampSeconds: null, completed: null, rating: null, note: null }] };
it("shows blank-clear guidance and counts normalized code points without UTF-16 maxLength clipping", () => {
  const action = vi.fn(async (): Promise<NoteState> => ({ kind: "idle" })); render(<NoteControls member={member} body={null} action={action} />);
  const field = screen.getByLabelText("Your note text"); expect(field.getAttribute("maxlength")).toBeNull(); expect(screen.getByText(/Saving blank or whitespace-only text clears/)).toBeTruthy(); expect(action).not.toHaveBeenCalled();
  fireEvent.change(field, { target: { value: " \r\n😀\rX\r\n " } }); expect(screen.getByText("3 / 2000 Unicode code points after normalization and trimming.")).toBeTruthy();
  const boundary = "😀".repeat(2000); fireEvent.change(field, { target: { value: boundary } }); expect((field as HTMLTextAreaElement).value).toBe(boundary); expect(field.getAttribute("aria-invalid")).toBe("false");
  fireEvent.change(field, { target: { value: boundary + "😀" } }); expect((field as HTMLTextAreaElement).value.length).toBe(4002); expect(field.getAttribute("aria-invalid")).toBe("true"); expect(screen.getByText(/Your draft has not been shortened/)).toBeTruthy();
  fireEvent.change(field, { target: { value: "valid" } }); expect(field.getAttribute("aria-invalid")).toBe("false");
});
it("retains draft through server validation/storage retry and associates its field errors", async () => {
  let calls = 0; render(<NoteControls member={member} body="Stored" action={async () => ++calls === 1 ? { kind: "invalid", error: "Synthetic invalid input.", message: "Check note." } : { kind: "error", message: "Please try again." }} />);
  fireEvent.change(screen.getByLabelText("Your note text"), { target: { value: "Unsaved draft 😀" } }); fireEvent.click(screen.getByText("Save note")); await screen.findByText("Synthetic invalid input."); expect(screen.getByLabelText("Your note text").getAttribute("aria-describedby")).toContain("note-error"); fireEvent.click(screen.getByText("Save note")); await screen.findByText("Please try again."); expect((screen.getByLabelText("Your note text") as HTMLTextAreaElement).value).toBe("Unsaved draft 😀");
});
it("pending blocks duplicates and successful clear resets the actual draft/counter to empty", async () => {
  let release!: (state: NoteState) => void; render(<NoteControls member={member} body="Stored" action={() => new Promise(done => { release = done; })} />);
  fireEvent.change(screen.getByLabelText("Your note text"), { target: { value: "😀".repeat(2001) } }); fireEvent.click(screen.getByText("Clear my note")); await screen.findByText("Saving your note…"); expect(screen.getByText("Save note").matches(":disabled")).toBe(true);
  await act(async () => release({ kind: "saved", note: { memberId: member.id, body: null }, message: "Your note is cleared. No notes." })); expect((screen.getByLabelText("Your note text") as HTMLTextAreaElement).value).toBe(""); expect(screen.getByText("0 / 2000 Unicode code points after normalization and trimming.")).toBeTruthy(); expect(screen.getByText("No notes saved for your profile.")).toBeTruthy();
});
it("group-only history renders script/HTML/Markdown/URL text inert with no link or rich-text nodes", () => {
  const action = async (): Promise<NoteState> => ({ kind: "idle" }); const view = render(<DetailView detail={{ ...detail, activeMemberId: null }} noteAction={action} />);
  expect(screen.getByRole("link", { name: "Choose profile" }).getAttribute("href")).toBe("/group"); const article = screen.getByRole("article", { name: "Anna" }); expect(article.querySelector(".personal-note")?.textContent).toBe(hostile); expect(article.querySelectorAll("script,a,strong,em,img").length).toBe(0); expect(within(screen.getByRole("article", { name: "Max" })).getByText("No notes")).toBeTruthy();
  view.rerender(<DetailView detail={{ ...detail, archived: true }} noteAction={action} />); expect(screen.queryByText("Save note")).toBeNull(); expect(screen.getByText("No notes")).toBeTruthy();
  view.rerender(<DetailView detail={{ ...detail, title: null, contentType: null, durationSeconds: null }} noteAction={action} ratingAction={async () => ({ kind: "idle" })} episodeAction={async () => ({ kind: "idle" })} />); expect(screen.getByText("Save note")).toBeTruthy(); expect(screen.getByText("Save rating")).toBeTruthy(); expect(screen.getByText("Save episode progress")).toBeTruthy();
});
