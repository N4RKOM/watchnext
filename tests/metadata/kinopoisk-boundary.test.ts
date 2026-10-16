// @vitest-environment node
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("Next rejects Client Component access to the server-configured Kinopoisk Unofficial adapter", () => {
  const root = mkdtempSync(join(tmpdir(), "watchnext-kinopoisk-boundary-"));
  const repository = fileURLToPath(new URL("../../", import.meta.url));
  const require = createRequire(import.meta.url);
  try {
    mkdirSync(join(root, "app"));
    cpSync(join(repository, "lib"), join(root, "lib"), { recursive: true });
    symlinkSync(join(repository, "node_modules"), join(root, "node_modules"), "junction");
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "watchnext-kinopoisk-boundary-fixture", private: true }));
    writeFileSync(join(root, "next.config.mjs"), "export default { experimental: { cpus: 2, webpackBuildWorker: false } };");
    writeFileSync(join(root, "app", "layout.js"), "export default function Layout({children}) { return <html><body>{children}</body></html>; }");
    writeFileSync(join(root, "app", "page.js"), '"use client"; import { configuredKinopoiskUnofficialProvider } from "../lib/metadata/kinopoisk"; export default function Page() { return <div>{typeof configuredKinopoiskUnofficialProvider}</div>; }');
    const result = spawnSync(process.execPath, [require.resolve("next/dist/bin/next"), "build", "--webpack"], {
      cwd: root, encoding: "utf8", timeout: 25000,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", KINOPOISK_UNOFFICIAL_API_KEY: "" },
    });
    const output = result.stdout + result.stderr;
    expect(result.error, output).toBeUndefined();
    expect(result.status, output).toBe(1);
    expect(output).toContain("server-only");
    expect(output).toMatch(/Client Component|client component|Server Component|server component/);
  } finally {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith("watchnext-kinopoisk-boundary-")) throw new Error("Unsafe boundary fixture cleanup");
    rmSync(root, { recursive: true, force: true });
  }
}, 30000);
