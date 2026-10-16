import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Navigation } from "../app/components/navigation";
import PickPage from "../app/pick/page";


const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
afterEach(cleanup);

describe("shared navigation", () => {
  for (const [path, label] of [["/", "Group entry"], ["/watchlist", "Watchlist"], ["/pick", "Pick for me"], ["/archive", "Archive"]]) {
    it(`marks only ${label} current on ${path} and supplies real destinations`, () => {
      route.pathname = path;
      render(<Navigation />);
      expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeTruthy();
      expect(screen.getAllByRole("link")).toHaveLength(4);
      expect(screen.getAllByRole("link").map((link) => link.getAttribute("href")))
        .toEqual(["/", "/watchlist", "/pick", "/archive"]);
      const current = screen.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
      expect(current).toHaveLength(1);
      expect(current[0].textContent).toBe(label);
    });
  }
});

describe("honest destination placeholders", () => {
  for (const [Page, heading] of [[PickPage, "Pick for me"]] as const) {
    it(`${heading} has one heading and an unavailable state without simulated controls`, () => {
      render(<Page />);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByRole("heading", { level: 1, name: heading })).toBeTruthy();
      expect(screen.getByText("Not available yet")).toBeTruthy();
      expect(screen.getAllByRole("heading").map((element) => element.tagName)).toEqual(["H1", "H2"]);
      expect(screen.queryByRole("button")).toBeNull();
      expect(screen.queryByRole("textbox")).toBeNull();
    });
  }
});
