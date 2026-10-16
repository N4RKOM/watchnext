import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DetailView } from "../app/watchlist/[id]/detail-view";
import { DetailError } from "../app/watchlist/[id]/detail-error";
import Loading from "../app/watchlist/[id]/loading";
import type { TitleDetails, MemberHistory } from "../lib/title-details";
const refresh = vi.hoisted(() => vi.fn());vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const member: MemberHistory = { id: "anna", name: "Anna", color: "#1d4ed8", positionState: null, nextSeason: null, nextEpisode: null, timestampSeconds: null, completed: null, rating: null, note: null };
const fixture: TitleDetails = { id: "film", title: "Saved film", contentType: "movie", durationSeconds: 60, numberingStyle: "none", archived: false, canEdit: false, coverUrl: null, sourceUrl: null, watchUrl: null, providerNamespace: null, providerId: null, genres: [], moods: ["Funny"], contributors: [member], history: [member] };
it("shows honest absence and attributed escaped notes with independent history and a preserved timestamp warning", () => {
  render(<DetailView detail={{ ...fixture, history: [{ ...member, timestampSeconds: 120, completed: true, rating: 9, note: "<script>fixture</script>\nSecond line" }, { ...member, id: "max", name: "Max", color: "#0f766e" }] }} />);
  expect(screen.getByText("No viewing link saved")).toBeTruthy(); expect(screen.queryByRole("link", { name: /Watch externally/ })).toBeNull();
  const anna = screen.getByRole("article", { name: "Anna" }); expect(within(anna).getByText("Manual timestamp: 2 min")).toBeTruthy();
  expect(within(anna).getByText(/needs correction/)).toBeTruthy(); expect(within(anna).getByText("Rating: 9/10")).toBeTruthy();
  expect(anna.querySelector("script")).toBeNull(); expect(anna.querySelector(".personal-note")?.textContent).toBe("<script>fixture</script>\nSecond line");
  const max = screen.getByRole("article", { name: "Max" }); for (const text of ["Manual timestamp: Not recorded", "Completion: Not recorded", "Rating: Not rated", "No notes"]) expect(within(max).getByText(text)).toBeTruthy();
});
it("labels safe external destinations and series numbering without implying episode-specific playback", () => {
  render(<DetailView detail={{ ...fixture, contentType: "series", numberingStyle: "season_episode", watchUrl: "https://example.com/series", sourceUrl: "https://example.com/info", history: [{ ...member, positionState: "in_progress", nextSeason: 2, nextEpisode: 3 }] }} />);
  const link = screen.getByRole("link", { name: "Open series (external)" }); expect(link.getAttribute("href")).toBe("https://example.com/series");expect(link.getAttribute("target")).toBe("_blank");expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  expect(screen.getByRole("link", { name: "Source (external)" }).getAttribute("href")).toBe("https://example.com/info"); expect(screen.getByText("Next: Season 2, episode 3")).toBeTruthy();
  expect(screen.getByText(/Watching externally does not update your progress/)).toBeTruthy();
});
it("distinguishes unknown/not-started episodic positions, archived banners, loading and retry states", () => {
  const rendered = render(<DetailView detail={{ ...fixture, archived: true, contentType: "anime", numberingStyle: "continuous", history: [{ ...member, positionState: "unknown" }, { ...member, id: "max", name: "Max", positionState: "not_started", nextEpisode: 1 }] }} />);
  expect(screen.getByText("Archived", { exact: true })).toBeTruthy(); expect(screen.getByText(/Restoration is not available yet/)).toBeTruthy(); expect(screen.getByText("Next episode: Unknown")).toBeTruthy();expect(screen.getByText("Not started — Episode 1")).toBeTruthy();expect(screen.queryByRole("button")).toBeNull();rendered.unmount();
  const loading=render(<Loading />);expect(screen.getByRole("status").textContent).toBe("Loading title details…");loading.unmount();render(<DetailError />);fireEvent.click(screen.getByRole("button",{name:"Try again"}));expect(refresh).toHaveBeenCalledTimes(1);
});
