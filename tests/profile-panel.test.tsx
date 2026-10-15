import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProfilePanel } from "../app/group/profile-panel";
import type { ProfileState } from "../lib/profile-state";
afterEach(cleanup);
const initial = { members: [], activeMemberId: null };
const success: ProfileState = { kind: "success", message: "Profile created and selected.", members: [{ id: "fixture", name: "Anna", color: "#6d28d9" }], activeMemberId: "fixture" };

it("shows an honest empty list, six labeled colors and a selectable created profile with initials and active text", async () => {
  render(<ProfilePanel initial={initial} action={async () => success} />);
  expect(screen.getByText("No profiles yet. Create the first one below.")).toBeTruthy();
  expect(screen.getAllByRole("radio")).toHaveLength(6);
  for (const color of ["Blue", "Purple", "Teal", "Rose", "Amber", "Slate"]) expect(screen.getByRole("radio", { name: color })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Anna" } });
  fireEvent.click(screen.getByRole("radio", { name: "Purple" }));
  fireEvent.click(screen.getByRole("button", { name: "Create and select profile" }));
  const active = await screen.findByRole("button", { name: /Anna Active/ });
  expect(active.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("Current profile:")).toBeTruthy();
  expect(active.querySelector(".avatar")?.textContent).toBe("A");
});

it("preserves invalid input with field-associated name/color errors", async () => {
  render(<ProfilePanel initial={initial} action={async () => ({ kind: "invalid", errors: { name: "Duplicate fixture", color: "Choose a color" } })} />);
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Anna" } });
  fireEvent.click(screen.getByRole("button", { name: "Create and select profile" }));
  await screen.findByText("Duplicate fixture");
  const input = screen.getByLabelText("Your name") as HTMLInputElement;
  expect(input.value).toBe("Anna");
  expect(input.getAttribute("aria-describedby")).toContain("profile-name-error");
  expect(screen.getByRole("group", { name: "Avatar color" }).getAttribute("aria-describedby")).toBe("profile-color-error");
});

it("disables every in-flight mutation and retains the last selected view after a recoverable error", async () => {
  let finish!: (state: ProfileState) => void;
  const action = vi.fn().mockResolvedValueOnce(success).mockImplementationOnce(() => new Promise<ProfileState>((resolve) => { finish = resolve; }));
  render(<ProfilePanel initial={initial} action={action} />);
  fireEvent.click(screen.getByRole("button", { name: "Create and select profile" }));
  await screen.findByRole("button", { name: /Anna Active/ });
  fireEvent.click(screen.getByRole("button", { name: "Create and select profile" }));
  const pending = await screen.findByRole("button", { name: "Updating profile…" });
  expect(pending.closest("fieldset")?.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /Anna Active/ }));
  expect(action).toHaveBeenCalledTimes(2);
  finish({ kind: "error", message: "Try again fixture" });
  await screen.findByRole("alert");
  await waitFor(() => expect(screen.getByRole("button", { name: /Anna Active/ }).getAttribute("aria-pressed")).toBe("true"));
});
