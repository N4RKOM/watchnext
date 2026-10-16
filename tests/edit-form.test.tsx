import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EditForm } from "../app/watchlist/[id]/edit/edit-form";
import { DetailView } from "../app/watchlist/[id]/detail-view";
import type { EditableTitle, EditState } from "../lib/edit-title-state";
import type { TitleDetails } from "../lib/title-details";
afterEach(cleanup);
const initial: EditableTitle = { id: "fixture", revision: "revision", moods: ["funny"], values: { title: "Film", contentType: "movie", minutes: "90", seconds: "0", numberingStyle: "none", genres: "Drama", watchUrl: "", sourceUrl: "https://example.com/source", coverUrl: "" } };
it("preloads reused metadata fields, retains attempted values on stale conflict and provides real reload/cancel", async () => {
  render(<EditForm initial={initial} action={async () => ({ kind: "stale", message: "Changed elsewhere" })} />);
  expect((screen.getByLabelText("Source link (optional)") as HTMLInputElement).value).toBe("https://example.com/source");fireEvent.change(screen.getByLabelText("Minutes"), { target: { value: "60" } });fireEvent.click(screen.getByRole("button", { name: "Save changes" }));await screen.findByText("Changed elsewhere");expect((screen.getByLabelText("Minutes") as HTMLInputElement).value).toBe("60");expect((screen.getByLabelText("Funny", { exact: true }) as HTMLInputElement).checked).toBe(true);expect(screen.getByRole("link", { name: "Reload current data" }).getAttribute("href")).toBe("/watchlist/fixture/edit");expect(screen.getByRole("link", { name: "Cancel and return to details" }).getAttribute("href")).toBe("/watchlist/fixture");
});
it("offers explicit identity confirmation and return-to-edit without another action", async () => {
  const action = vi.fn().mockResolvedValue({ kind: "confirmation", confirmation: "proposal", title: "Changed name", message: "Confirm this existing entry" });render(<EditForm initial={initial} action={action} />);fireEvent.change(screen.getByLabelText("Title", { exact: true }), { target: { value: "Changed name" } });fireEvent.click(screen.getByRole("button", { name: "Save changes" }));await screen.findByRole("button", { name: "Confirm identity change" });fireEvent.click(screen.getByRole("button", { name: "Return to editing" }));expect(action).toHaveBeenCalledTimes(1);expect((screen.getByLabelText("Title", { exact: true }) as HTMLInputElement).value).toBe("Changed name");
});
it("associates URL validation, disables pending actions and retains retry input", async () => {
  let finish!: (state: EditState) => void;const action = vi.fn(() => new Promise<EditState>((resolve) => { finish = resolve; }));render(<EditForm initial={initial} action={action} />);fireEvent.click(screen.getByRole("button", { name: "Save changes" }));const pending = await screen.findByRole("button", { name: "Saving changes…" });expect(pending.closest("fieldset")?.disabled).toBe(true);fireEvent.click(pending);expect(action).toHaveBeenCalledTimes(1);finish({ kind: "invalid", errors: { sourceUrl: "Unsafe source fixture" } });await screen.findByText("Unsafe source fixture");expect(screen.getByLabelText("Source link (optional)").getAttribute("aria-describedby")).toBe("sourceUrl-error");
});
it("exposes both real eligible edit actions and hides them on archived/noncontributor detail views", () => {
  const detail: TitleDetails = { id: "fixture", title: "Film", contentType: "movie", durationSeconds: 60, numberingStyle: "none", canEdit: true, archived: false, coverUrl: null, watchUrl: null, sourceUrl: null, providerId: null, providerNamespace: null, genres: [], moods: [], contributors: [], history: [] };
  const { rerender } = render(<DetailView detail={detail} />);for (const name of ["Edit title", "Add viewing link"]) expect(screen.getByRole("link", { name }).getAttribute("href")).toBe("/watchlist/fixture/edit");rerender(<DetailView detail={{ ...detail, canEdit: false }} />);expect(screen.queryByRole("link", { name: "Edit title" })).toBeNull();rerender(<DetailView detail={{ ...detail, archived: true }} />);expect(screen.queryByRole("link", { name: "Edit title" })).toBeNull();
});
