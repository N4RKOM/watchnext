import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TitleForm } from "../app/watchlist/add/title-form";
import { lookupMetadata } from "../lib/metadata/lookup";
import type { ReviewResult } from "../lib/metadata/reviews";
import type { TitleFormState } from "../lib/title-state";
afterEach(cleanup);
async function proposal(title = "Provider video"): Promise<ReviewResult> {
  return { ...await lookupMetadata({ namespace: "youtube", lookup: async () => ({ kind: "item", item: { externalId: "YtFixture01", title, contentType: "youtube", duration: { seconds: 120, meaning: "full_item", verified: true } } }) }, { kind: "detail", externalId: "YtFixture01" }), handle: "synthetic-review" };
}
const save = async (): Promise<TitleFormState> => ({ kind: "error", message: "Synthetic storage failure; details kept." });
function source(value: string) { fireEvent.change(screen.getByLabelText("Entry method"), { target: { value } }); }
it("stages lookup until explicit replacement and preserves edits/moods made while waiting", async () => {
  let resolve!: (result: ReviewResult) => void;
  render(<TitleForm action={save} lookup={() => new Promise(done => { resolve = done; })} select={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "My existing draft" } }); fireEvent.click(screen.getByLabelText("Funny"));
  source("youtube"); fireEvent.change(screen.getByLabelText("YouTube video link or ID"), { target: { value: "YtFixture01" } }); fireEvent.click(screen.getByText("Look up video"));
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Edited while waiting" } });
  await act(async () => resolve(await proposal()));
  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Edited while waiting");
  fireEvent.click(screen.getByText("Apply proposal and replace details"));
  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Provider video");
  expect((screen.getByLabelText("Funny") as HTMLInputElement).checked).toBe(true);
  expect((screen.getByLabelText("Minutes") as HTMLInputElement).value).toBe("2");
  fireEvent.click(screen.getByText("Save title"));
  await screen.findByText("Synthetic storage failure; details kept.");
  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Provider video");
});
it("cancelled/older lookup responses cannot replace a newer proposal or manual fields", async () => {
  const resolvers: ((result: ReviewResult) => void)[] = [];
  render(<TitleForm action={save} lookup={() => new Promise(done => { resolvers.push(done); })} select={vi.fn()} />);
  source("youtube"); fireEvent.change(screen.getByLabelText("YouTube video link or ID"), { target: { value: "first" } }); fireEvent.click(screen.getByText("Look up video"));
  fireEvent.click(screen.getByText("Cancel lookup"));
  fireEvent.change(screen.getByLabelText("YouTube video link or ID"), { target: { value: "second" } }); fireEvent.click(screen.getByText("Look up video"));
  await act(async () => resolvers[1](await proposal("Newest proposal")));
  await act(async () => resolvers[0](await proposal("Old ignored proposal")));
  expect(screen.queryByText(/Old ignored proposal/)).toBeNull(); fireEvent.click(screen.getByText("Apply proposal and replace details"));
  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Newest proposal");
});
it("failure/source switching preserves manual input and usable save controls", async () => {
  render(<TitleForm action={save} lookup={async () => ({ kind: "failure", code: "not_configured", message: "Provider not configured; continue manually.", retry: "after_configuration", retryAfterSeconds: null, manualFallback: true })} select={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "My manual title" } }); source("youtube"); fireEvent.click(screen.getByText("Look up video"));
  await screen.findByText("Provider not configured; continue manually.");
  source("kinopoisk_unofficial"); source("manual");
  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("My manual title");
  expect((screen.getByText("Save title") as HTMLButtonElement).disabled).toBe(false);
});
it("ambiguous candidates require explicit selection; no automatic detail call or mood assignment", async () => {
  const select = vi.fn(async (_form: FormData) => proposal("Chosen candidate"));
  render(<TitleForm action={save} lookup={async () => ({ kind: "candidates", handle: "synthetic-search", requiresSelection: true, omittedInvalidCandidates: false, candidates: [{ identity: { namespace: "kinopoisk_unofficial", externalId: "1001" }, title: "Same name", year: 2001, contentType: "movie", coverUrl: null }, { identity: { namespace: "kinopoisk_unofficial", externalId: "1002" }, title: "Same name", year: 2020, contentType: "series", coverUrl: null }] })} select={select} />);
  source("kinopoisk_unofficial"); fireEvent.click(screen.getByText("Search titles"));
  await screen.findByText("Review Same name (2020)"); expect(select).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Review Same name (2020)"));
  await waitFor(() => expect(select).toHaveBeenCalledTimes(1));
  const form = select.mock.calls[0][0] as FormData; expect(form.get("candidateId")).toBe("1002");
  await screen.findByText("Apply proposal and replace details");
  expect((screen.getByLabelText("Funny") as HTMLInputElement).checked).toBe(false);
});
