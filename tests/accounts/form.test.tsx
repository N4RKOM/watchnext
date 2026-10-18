import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AccountForm } from "../../app/components/account-form";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const fill = () => { fireEvent.change(screen.getByLabelText("Username"), { target: { value: "Display.User" } }); fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Private password value" } }); };
it("uses body-only POST even before hydration and preserves username but clears secrets on actionable errors", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Username or password is incorrect." }) }); vi.stubGlobal("fetch", fetcher);
  render(<AccountForm operation="login" />); fill();
  const form = screen.getByRole("button", { name: "Sign in" }).closest("form")!;
  expect(form.method).toBe("post"); expect(form.getAttribute("action")).toBe("/api/account/login");
  fireEvent.submit(form); await screen.findByRole("alert");
  expect((screen.getByLabelText("Username") as HTMLInputElement).value).toBe("Display.User"); expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
  expect(document.activeElement).toBe(screen.getByRole("alert"));
  expect(fetcher.mock.calls[0][1].body).toContain("Private password value");
});
it("prevents duplicate pending submits and announces work", async () => {
  let finish!: (value: unknown) => void;
  const fetcher = vi.fn(() => new Promise(resolve => { finish = resolve; })); vi.stubGlobal("fetch", fetcher);
  render(<AccountForm operation="login" />); fill(); const form = screen.getByRole("button").closest("form")!;
  fireEvent.submit(form); fireEvent.submit(form); expect(fetcher).toHaveBeenCalledTimes(1); expect(screen.getByRole("status").textContent).toContain("Checking");
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  finish({ ok: false, json: async () => ({ error: "Try again." }) }); await screen.findByRole("alert");
});
it("shows private recovery once, supports manual copy fallback, and discards it on page departure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ recoveryCode: "SyntheticOneTimeRecoveryValue" }) }));
  render(<AccountForm operation="register" />); fill(); fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Private password value" } });
  fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form")!);
  const code = await screen.findByLabelText("Private recovery code"); expect((code as HTMLInputElement).value).toBe("SyntheticOneTimeRecoveryValue");
  fireEvent.click(screen.getByRole("button", { name: "Copy recovery code" })); await waitFor(() => expect(screen.getByRole("status").textContent).toContain("copy it manually"));
  expect(screen.getByRole("link", { name: /Continue/ }).getAttribute("href")).toBe("/account");
  fireEvent(window, new Event("pagehide")); expect(screen.queryByLabelText("Private recovery code")).toBeNull();
});
