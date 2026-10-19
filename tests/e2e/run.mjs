import {runAccounts} from "../fixtures/accounts-browser-check.mjs";
import {runRecovery} from "../fixtures/recovery-browser-check.mjs";
import {runAccountGroups} from "../fixtures/account-groups-browser-check.mjs";
import {runAutofill} from "../fixtures/autofill-browser-check.mjs";
import {runMine} from "../fixtures/watchlist-mine-browser-check.mjs";
import { createFixture, safeDiagnostic } from "./lifecycle.mjs";
import { journeys } from "./journeys.mjs";
let fixture, current = "setup", failure, report;
const injected = process.argv.slice(2);
const check = (value, expected) => { if (!value) throw new Error(`Expected: ${expected}; observed: condition was false`); };
const step = async (name, run) => { current = name; await run(); console.log(`PASS ${name}`); };
const interrupted = async () => { if (!failure) failure = new Error("Run interrupted"); try { await fixture?.cleanup(); } catch {} process.exit(1); };
process.once("SIGINT", interrupted); process.once("SIGTERM", interrupted);
try {
  if (injected.some(arg => !["--inject-failure","--inject-auth-failure"].includes(arg)) || injected.length > 1) throw new Error("Use pnpm test:e2e, optionally --inject-failure or --inject-auth-failure for cleanup verification");
  fixture = await createFixture();
  await step("current production build", () => fixture.build());
  await step("installed Chromium and owned production server", async () => { await fixture.launch(); await fixture.start(); });
  if (injected.includes("--inject-failure")) await step("injected failure cleanup", () => { throw new Error("Expected: deliberate failure is nonzero after cleanup; observed: injected safe failure"); });
  report = await journeys(fixture, step, check);
  current = "legacy privacy/sentinel audit"; await fixture.audit();await fixture.cleanup();
  for(const[name,run]of[["account credentials",runAccounts],["password recovery",runRecovery],["account groups/owner/history",runAccountGroups],["provider autofill/previews",runAutofill],["All/Mine/private navigation",runMine]]){
    current=name;
    report.push({suite:name,...await run({build:false,onFixture:value=>{fixture=value;},injectFailure:injected.includes("--inject-auth-failure")&&name==="account credentials"})});
  }
  current = "all suite privacy/sentinel audits and owned cleanup completed";
} catch (error) { failure = error; }
finally {
  try { await fixture?.cleanup(); } catch (error) { failure ??= error; current = "cleanup/privacy audit"; }
  process.removeListener("SIGINT", interrupted); process.removeListener("SIGTERM", interrupted);
}
if (failure) { console.error(`FAIL ${current}: ${safeDiagnostic(failure, fixture?.secrets ?? [], fixture?.root ?? "<none>", fixture ? [fixture.sentinelRoot] : [])}`); console.error(`Owned cleanup complete: ${fixture?.cleanupComplete ?? "no fixture created"}; no screenshots, traces, HAR or video retained.`); process.exitCode = 1; }
else console.log(JSON.stringify({ pass: true, journeys: report, privacyScan: true, unrelatedSentinelsUnchanged: true, ownedProcessesAndDataCleaned: true }));
