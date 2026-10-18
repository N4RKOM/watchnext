import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Navigation } from "../app/components/navigation";
import { Picker } from "../app/pick/picker";


const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
afterEach(cleanup);

describe("shared navigation", () => {
  for (const [path, label] of [["/", "Group entry"], ["/watchlist", "Watchlist"], ["/pick", "Pick for me"], ["/archive", "Archive"], ["/account", "Account groups"]]) {
    it(`marks only ${label} current on ${path} and supplies real destinations`, () => {
      route.pathname = path;
      render(<Navigation />);
      expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeTruthy();
      expect(screen.getAllByRole("link")).toHaveLength(5);
      expect(screen.getAllByRole("link").map((link) => link.getAttribute("href")))
        .toEqual(["/", "/watchlist", "/pick", "/archive", "/account"]);
      const current = screen.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
      expect(current).toHaveLength(1);
      expect(current[0].textContent).toBe(label);
    });
  }
});

it("real Pick destination keeps one heading and an honest empty-group action", () => {
  render(<Picker view={{ groupId: "group", groupName: "Actual group", members: [], hasActiveProfile: false }} action={async () => ({ kind: "idle" })} />);
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getByRole("heading", { level: 1, name: "Pick for me" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Create a profile" }).getAttribute("href")).toBe("/group");
  expect(screen.queryByRole("button")).toBeNull();
});
