// @vitest-environment node
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("Next rejects a client component importing the database server entry point", () => {
  const root = mkdtempSync(join(tmpdir(), "watchnext-boundary-test-"));
  const repository = fileURLToPath(new URL("../../", import.meta.url));
  const require = createRequire(import.meta.url);
  try {
    mkdirSync(join(root, "app"));
    cpSync(join(repository, "db"), join(root, "db"), { recursive: true });
    symlinkSync(join(repository, "node_modules"), join(root, "node_modules"), "junction");
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "watchnext-boundary-fixture", private: true }));
    // Keep compiler diagnostics on the captured process stream. Next's separate
    // build worker can exit before its forwarded diagnostic output is flushed.
    writeFileSync(join(root, "next.config.mjs"), "export default { experimental: { webpackBuildWorker: false } };");
    writeFileSync(join(root, "app", "layout.js"), "export default function Layout({children}) { return <html><body>{children}</body></html>; }");
    writeFileSync(join(root, "app", "page.js"), '"use client"; import { getDatabase } from "../db/server"; export default function Page() { return <div>{typeof getDatabase}</div>; }');
    // Webpack can resolve the shared dependency junction outside this isolated root.
    const result = spawnSync(process.execPath, [require.resolve("next/dist/bin/next"), "build", "--webpack"], {
      cwd: root, encoding: "utf8", timeout: 25000,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", WATCHNEXT_DATABASE_PATH: join(root, "unused.sqlite") },
    });
    const output = result.stdout + result.stderr;
    expect(result.error, output).toBeUndefined();
    expect(result.status, output).toBe(1);
    expect(output).toContain("server-only");
    expect(output).toMatch(/Client Component|client component|Server Component|server component/);
  } finally {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith("watchnext-boundary-test-")) {
      throw new Error("Unsafe boundary fixture cleanup");
    }
    rmSync(root, { recursive: true, force: true });
  }
}, 30000);
