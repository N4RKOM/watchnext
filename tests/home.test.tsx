import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import HomePage from "../app/page";

afterEach(cleanup);

test("the home page presents the WatchNext heading", () => {
  render(<HomePage />);

  expect(
    screen.getByRole("heading", { level: 1, name: "WatchNext" }).textContent,
  ).toBe("WatchNext");
});
