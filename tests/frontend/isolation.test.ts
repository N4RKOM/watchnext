// @vitest-environment node
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { expect, it } from "vitest";
it("keeps the entire mock entry import closure client-safe with no native/auth/provider side effects", () => {
  const root = process.cwd(), seen = new Set<string>();
  function visit(path: string) {
    if (seen.has(path)) return; seen.add(path); const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(/\b(?:fetch|require)\s*\(|process\.env|document\.cookie|\b(?:localStorage|sessionStorage)\b|["']use server["']/);
    for (const match of source.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g)) {
      const id = match[1]; expect(id).not.toMatch(/^(?:node:|server-only|@prisma)/);
      if (!id.startsWith(".") || id.endsWith(".css")) continue;
      const base = resolve(dirname(path), id), target = [base + ".ts", base + ".tsx"].find(existsSync);
      if (!target) throw Error("Unresolved client import");
      expect(relative(root, target).replaceAll("\\", "/")).toMatch(/^(?:frontend\/|app\/mock\/)/); visit(target);
    }
  }
  visit(resolve(root, "app/mock/page.tsx")); expect(seen.size).toBeGreaterThanOrEqual(4);
});
