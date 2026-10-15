import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import HomePage from "../app/page";

vi.mock("../app/actions/create-group", () => ({ createGroupAction: async () => ({ kind: "idle" }) }));

afterEach(cleanup);

test("the home page presents the WatchNext heading", () => {
  render(<HomePage />);

  expect(
    screen.getByRole("heading", { level: 1, name: "WatchNext" }).textContent,
  ).toBe("WatchNext");
});
