import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WatchlistContent } from "../app/watchlist/watchlist-view";
import { Cover } from "../app/watchlist/cover";
import { WatchlistLoadError } from "../app/watchlist/load-error";
import Loading from "../app/watchlist/loading";
import type { WatchlistItem } from "../lib/watchlist";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const fixture: WatchlistItem = { id: "fixture", title: "Shared film", contentType: "movie", durationSeconds: 1501, numberingStyle: "none", coverUrl: null, moods: ["Funny", "Relaxing"], contributors: [{ id: "anna", name: "Anna", color: "#1d4ed8" }, { id: "max", name: "Max", color: "#0f766e" }] };
it("renders all persisted metadata once and an actual detail opener for selected profiles", () => {
  render(<WatchlistContent view={{ activeMemberId: "anna", items: [fixture] }} />);
  const cards = screen.getAllByRole("article"); expect(cards).toHaveLength(1);
  expect(within(cards[0]).getByText("Full duration: 25 min 1 sec")).toBeTruthy();
  expect(within(cards[0]).getByText("Moods: Funny, Relaxing")).toBeTruthy();
  expect(within(cards[0]).getByText("Anna").previousElementSibling?.getAttribute("style")).toContain("rgb(29, 78, 216)");
  expect(within(cards[0]).getByText("Max").previousElementSibling?.getAttribute("style")).toContain("rgb(15, 118, 110)");
  expect(screen.getByRole("link", { name: "View details: Shared film" }).getAttribute("href")).toBe("/watchlist/fixture");
});
it("allows browsing/details without selected profile but routes adding through profile selection", () => {
  render(<WatchlistContent view={{ activeMemberId: null, items: [{ ...fixture, contentType: "anime", numberingStyle: "continuous" }] }} />);
  expect(screen.getByText("Typical episode duration: 25 min 1 sec")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Choose profile" }).getAttribute("href")).toBe("/group");
  expect(screen.getByRole("link", { name: "View details: Shared film" }).getAttribute("href")).toBe("/watchlist/fixture");
  expect(screen.queryByRole("link", { name: "Add title" })).toBeNull();
});
it("distinguishes honest empty, loading and failed states, with a real refresh action", () => {
  const { unmount } = render(<WatchlistContent view={{ activeMemberId: null, items: [] }} />);
  expect(screen.getByRole("heading", { name: "Your watchlist is empty" })).toBeTruthy(); unmount();
  const loading = render(<Loading />); expect(screen.getByRole("status").textContent).toBe("Loading your watchlist…"); loading.unmount();
  render(<WatchlistLoadError />); expect(screen.getByRole("heading", { name: "Couldn’t load your watchlist" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Try again" })); expect(refresh).toHaveBeenCalledTimes(1);
});
it("never renders unsafe image URLs and replaces a failed cover with the stable fallback", () => {
  const { rerender } = render(<Cover url="javascript:alert(1)" title="Fixture" />); expect(screen.queryByRole("img")).toBeNull(); expect(screen.getByText("No cover")).toBeTruthy();
  rerender(<Cover url="https://name:password@example.com/cover.png" title="Fixture" />); expect(screen.queryByRole("img")).toBeNull();
  rerender(<Cover url="https://i.ytimg.com/vi/YtFixture01/default.jpg" title="Fixture" />); fireEvent.error(screen.getByRole("img", { name: "Fixture cover" })); expect(screen.queryByRole("img")).toBeNull(); expect(screen.getByText("No cover")).toBeTruthy();
});

it("unsupported authored URLs render fallback; a changed safe URL resets failed-image state and aspect ratio",()=>{
 const {rerender}=render(<Cover url="https://example.com/authored-cover.jpg" title="Authored"/>);expect(screen.queryByRole("img")).toBeNull();
 rerender(<Cover url="https://i.ytimg.com/vi/YtFixture01/default.jpg" title="Video"/>);const image=screen.getByRole("img");expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");expect(image.parentElement?.className).toContain("video-cover");fireEvent.error(image);expect(screen.queryByRole("img")).toBeNull();
 rerender(<Cover url="https://kinopoiskapiunofficial.tech/images/posters/kp/301.jpg" title="Poster"/>);expect(screen.getByRole("img").getAttribute("src")).toContain("/301.jpg");expect(screen.getByRole("img").parentElement?.className).not.toContain("video-cover");
});

it("detects an already cached image failure at hydration and keeps an honest stable fallback",()=>{
 const complete=vi.spyOn(HTMLImageElement.prototype,"complete","get").mockReturnValue(true),width=vi.spyOn(HTMLImageElement.prototype,"naturalWidth","get").mockReturnValue(0);
 try{render(<Cover url="https://i.ytimg.com/vi/YtFixture01/default.jpg" title="Cached failure"/>);expect(screen.queryByRole("img")).toBeNull();expect(screen.getByText("No cover")).toBeTruthy();}finally{complete.mockRestore();width.mockRestore();}
});
