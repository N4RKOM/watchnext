import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CreateGroupForm } from "../app/components/create-group-form";
import type { CreateGroupState } from "../lib/group-state";

const syntheticSuccess: CreateGroupState = { kind: "created", name: "Example group", inviteUrl: "https://example.invalid/invite/SYNTHETIC_NOT_A_CREDENTIAL", loopback: false };
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
afterEach(() => { cleanup(); if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor); else Reflect.deleteProperty(navigator, "clipboard"); });
const fillAndSubmit = () => {
  fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "My group" } });
  fireEvent.click(screen.getByRole("button", { name: "Create group" }));
};

it("shows associated validation feedback and retains the entered name", async () => {
  render(<CreateGroupForm action={async () => ({ kind: "invalid", nameError: "Example field error" })} />);
  fillAndSubmit();
  await screen.findByRole("alert");
  const field = screen.getByLabelText("Group name") as HTMLInputElement;
  expect(field.value).toBe("My group");
  expect(field.getAttribute("aria-invalid")).toBe("true");
  expect(field.getAttribute("aria-describedby")).toContain(screen.getByRole("alert").id);
});

it("indicates saving, disables submission in flight, then permits a deliberate new group", async () => {
  let finish!: (state: CreateGroupState) => void;
  const action = vi.fn(() => new Promise<CreateGroupState>((resolve) => { finish = resolve; }));
  render(<CreateGroupForm action={action} />);
  fillAndSubmit();
  const pending = await screen.findByRole("button", { name: "Creating group…" });
  expect((pending as HTMLButtonElement).disabled || pending.closest("fieldset")?.disabled).toBe(true);
  fireEvent.click(pending);
  expect(action).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status").textContent).toContain("Saving");
  finish(syntheticSuccess);
  await screen.findByRole("button", { name: "Create another group" });
  expect(screen.getByText(/Open it to enter your group/)).toBeTruthy();
});

it("preserves input and offers retry without a URL after a save error", async () => {
  render(<CreateGroupForm action={async () => ({ kind: "error", message: "Please try again." })} />);
  fillAndSubmit();
  await screen.findByRole("alert");
  expect((screen.getByLabelText("Group name") as HTMLInputElement).value).toBe("My group");
  expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  expect(screen.queryByLabelText("Invite link")).toBeNull();
});

it("copies exactly the displayed URL and announces success", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<CreateGroupForm action={async () => syntheticSuccess} />);
  fillAndSubmit();
  fireEvent.click(await screen.findByRole("button", { name: "Copy invite link" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Invite link copied."));
  expect(writeText).toHaveBeenCalledWith((screen.getByLabelText("Invite link") as HTMLInputElement).value);
});

for (const available of [false, true]) it(`keeps a selectable manual-copy fallback when clipboard ${available ? "rejects" : "is missing"}`, async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: available ? { writeText: vi.fn().mockRejectedValue(new Error("Denied")) } : undefined });
  render(<CreateGroupForm action={async () => ({ ...syntheticSuccess, loopback: true })} />);
  fillAndSubmit();
  fireEvent.click(await screen.findByRole("button", { name: "Copy invite link" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("copy it manually"));
  expect((screen.getByLabelText("Invite link") as HTMLInputElement).readOnly).toBe(true);
  expect(screen.getByText(/Friends can’t open it/)).toBeTruthy();
  expect(screen.queryByText("Invite link copied.")).toBeNull();
});
