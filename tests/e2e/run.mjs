import { createFixture, safeDiagnostic } from "./lifecycle.mjs";
import { journeys } from "./journeys.mjs";
let fixture, current = "setup", failure, report;
const injected = process.argv.slice(2);
const check = (value, expected) => { if (!value) throw new Error(`Expected: ${expected}; observed: condition was false`); };
const step = async (name, run) => { current = name; await run(); console.log(`PASS ${name}`); };
const interrupted = async () => { if (!failure) failure = new Error("Run interrupted"); try { await fixture?.cleanup(); } catch {} process.exit(1); };
process.once("SIGINT", interrupted); process.once("SIGTERM", interrupted);
try {
  if (injected.some(arg => arg !== "--inject-failure") || injected.length > 1) throw new Error("Use pnpm test:e2e, optionally --inject-failure for cleanup verification");
  fixture = await createFixture();
  await step("current production build", () => fixture.build());
  await step("installed Chromium and owned production server", async () => { await fixture.launch(); await fixture.start(); });
  if (injected.length) await step("injected failure cleanup", () => { throw new Error("Expected: deliberate failure is nonzero after cleanup; observed: injected safe failure"); });
  report = await journeys(fixture, step, check);
  current = "privacy/sentinel audit"; await fixture.audit();
} catch (error) { failure = error; }
finally {
  try { await fixture?.cleanup(); } catch (error) { failure ??= error; current = "cleanup/privacy audit"; }
  process.removeListener("SIGINT", interrupted); process.removeListener("SIGTERM", interrupted);
}
if (failure) { console.error(`FAIL ${current}: ${safeDiagnostic(failure, fixture?.secrets ?? [], fixture?.root ?? "<none>")}`); console.error(`Owned cleanup complete: ${fixture?.cleanupComplete ?? "no fixture created"}; no screenshots, traces, HAR or video retained.`); process.exitCode = 1; }
else console.log(JSON.stringify({ pass: true, journeys: report, privacyScan: true, unrelatedSentinelsUnchanged: true, ownedProcessesAndDataCleaned: true }));
