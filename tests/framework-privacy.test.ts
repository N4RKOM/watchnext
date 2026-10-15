// @vitest-environment node
import { spawnSync } from "node:child_process";
import { afterEach, expect, it, vi } from "vitest";
import config from "../next.config.mjs";

afterEach(() => vi.unstubAllEnvs());

it("fails closed when serving without the privacy preload and retains compiler configuration", () => {
  vi.stubEnv("NEXT_TRACE_SPAN_THRESHOLD_MS", "-1");
  expect(() => config("phase-development-server")).toThrow("pnpm dev");
  expect(() => config("phase-production-server")).toThrow("pnpm start");
  expect(config("phase-production-build").logging.incomingRequests).toBe(false);
});

it("preloads suppression before the pinned framework tracer can record request spans", () => {
  const preload = new URL("../scripts/framework-privacy.mjs", import.meta.url).href;
  const probe = `const trace = await import('next/dist/trace/trace.js');
    trace.initializeTraceState({lastId:0,shouldSaveTraceEvents:true});
    trace.trace('request-fixture',undefined,{url:'/invite/SYNTHETIC_NOT_A_CREDENTIAL'}).stop();
    if(trace.getTraceEvents().length!==0)process.exit(1);`;
  const result = spawnSync(process.execPath, ["--import", preload, "--input-type=module", "-e", probe], { encoding: "utf8" });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
});
