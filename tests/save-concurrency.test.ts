// @vitest-environment node
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { migrate } from "../db/migrate";
import { createGroup } from "../lib/groups";
import { acceptInvitation, sessionCookieName, requireSession } from "../lib/sessions";
import { changeProfile } from "../lib/profiles";
const origin = "https://watch.example";
it("serializes competing provider saves and keeps competing manual saves confirmation-gated across processes", async () => {
  const root = mkdtempSync(join(tmpdir(), "watchnext-save-race-")), path = join(root, "fixture.sqlite"), db = new DatabaseSync(path);
  const children: ReturnType<typeof spawn>[] = [];
  try {
    migrate(db);const invite = createGroup(db, "Fixture", origin).inviteUrl.split("/").at(-1)!;
    const credentials = [acceptInvitation(db, invite), acceptInvitation(db, invite)];
    for (const [i, credential] of credentials.entries()) changeProfile(db, new Request(origin, { method: "POST", headers: { origin, cookie: `${sessionCookieName}=${credential}` } }), { intent: "create", name: `Member ${i}`, color: "#1d4ed8" }, origin);
    const run = async (kind: "provider" | "manual", title: string, operations?: ["remove" | "save", "remove" | "save"]) => {
      const pending = credentials.map((credential) => {
        const child = spawn(process.execPath, ["--experimental-transform-types", "--import", new URL("./fixtures/save-resolver.mjs", import.meta.url).href, fileURLToPath(new URL("./fixtures/save-worker.mjs", import.meta.url)), new URL("../lib/shared-save.ts", import.meta.url).href, path], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });children.push(child);
        let output = "", errors = "";
        const ready = new Promise<void>((resolveReady, reject) => { child.stdout!.on("data", (data) => { output += data; if (output.startsWith("ready\n")) resolveReady(); });child.once("error", reject);child.once("exit", () => { if (!output.startsWith("ready\n")) reject(new Error(`Fixture startup failed: ${errors}`)); }); });
        child.stderr!.on("data", (data) => errors += data);
        const done = new Promise<Record<string, unknown>>((resolveResult, reject) => child.once("exit", (code) => {
          if (code !== 0) return reject(new Error(`Fixture worker failed (${code}): ${errors}`));
          if (output.includes(credential) || errors.includes(credential)) return reject(new Error("Fixture credential leaked"));
          resolveResult(JSON.parse(output.trim().split("\n").at(-1)!));
        }));
        // Readiness is awaited before results; still handle an early worker failure.
        void done.catch(() => {});
        return { child, ready, done, credential };
      });
      await Promise.all(pending.map((job) => job.ready));
      for (const [index, job] of pending.entries()) job.child.stdin!.end(JSON.stringify({ origin, credential: job.credential, ...(operations ? { operation: operations[index], id: db.prepare("SELECT id FROM titles WHERE provider_namespace='youtube' AND provider_id='race-id'").get()?.id } : {}), input: { kind, fields: { title, contentType: "movie", minutes: "20", seconds: "", numberingStyle: "none", genres: "", moods: ["funny"], watchUrl: "" }, ...(kind === "provider" ? { provider: { namespace: "youtube", externalId: "race-id" } } : {}) } }));
      return Promise.all(pending.map((job) => job.done));
    };
    const provider = await run("provider", "Provider race");expect(provider.map((result) => result.kind).sort()).toEqual(["created", "existing"]);expect(provider[0].id).toBe(provider[1].id);
    expect(db.prepare("SELECT count(*) AS n FROM titles").get()?.n).toBe(1);expect(db.prepare("SELECT count(*) AS n FROM contributors").get()?.n).toBe(2);
    const manual = await run("manual", "Manual race");expect(manual.map((result) => result.kind).sort()).toEqual(["confirmation_required", "created"]);expect(manual[0].id).toBe(manual[1].id);
    expect(db.prepare("SELECT count(*) AS n FROM contributors WHERE title_id=?").get(manual[0].id as string)?.n).toBe(1);
    const providerId=provider[0].id as string, anna=requireSession(db,credentials[0]), max=requireSession(db,credentials[1]);
    for(const [member,time]of[[anna.activeMemberId,40],[max.activeMemberId,20]] as const)db.prepare("INSERT INTO progress(group_id,title_id,member_id,numbering_style,timestamp_seconds) VALUES (?,?,?,'none',?)").run(anna.groupId,providerId,member!,time);
    db.prepare("DELETE FROM contributors WHERE title_id=? AND member_id=?").run(providerId,max.activeMemberId!);
    const history=JSON.stringify(db.prepare("SELECT * FROM progress ORDER BY member_id").all()),metadata=db.prepare("SELECT * FROM titles WHERE id=?").get(providerId);
    await run("provider","Incoming metadata must not replace the saved work",["remove","save"]);
    expect(db.prepare("SELECT * FROM titles WHERE id=?").get(providerId)).toEqual(metadata);expect(db.prepare("SELECT member_id FROM contributors WHERE title_id=?").all(providerId)).toEqual([{member_id:max.activeMemberId}]);expect(JSON.stringify(db.prepare("SELECT * FROM progress ORDER BY member_id").all())).toBe(history);
    await run("provider","Provider race");await run("provider","Provider race",["remove","remove"]);
    expect(db.prepare("SELECT archived FROM titles WHERE id=?").get(providerId)?.archived).toBe(1);expect(db.prepare("SELECT count(*) AS n FROM contributors WHERE title_id=?").get(providerId)?.n).toBe(0);expect(JSON.stringify(db.prepare("SELECT * FROM progress ORDER BY member_id").all())).toBe(history);
  } finally {
    for (const child of children) if (child.exitCode === null) child.kill();db.close();
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith("watchnext-save-race-")) throw new Error("Unsafe fixture cleanup");
    rmSync(root, { recursive: true, force: true });
  }
}, 15000);
