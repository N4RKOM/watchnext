import { sameContext, selectDemo } from "../service/contracts";
import type { ContextIdentity, FrontendService, MockContext, MockScenario, RequestOptions, ServiceResult } from "../service/contracts";
let instances = 0;
export const scenarioDelays: Readonly<Record<MockScenario, number>> = Object.freeze({ ready: 80, slow: 1200, unavailable: 300 });
export const pendingDomains = Object.freeze([
  { key: "accounts", label: "Accounts and recovery", issue: 55 },
  { key: "groups", label: "Groups, invitations and legacy access", issue: 56 },
  { key: "library", label: "Shared library, details and archive", issue: 57 },
  { key: "entry", label: "Manual entry and provider review", issue: 58 },
  { key: "personal", label: "Personal progress, ratings and notes", issue: 59 },
  { key: "picker", label: "Picker and Pick again", issue: 60 },
] as const);
function cancelled(): ServiceResult<never> { return { kind: "cancelled", message: "Preview request canceled. No demo state was changed." }; }
function stale(): ServiceResult<never> { return { kind: "stale", message: "The demo context changed. Load the current preview before trying again." }; }
function wait(delay: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise(resolve => {
    const finish = (completed: boolean) => { clearTimeout(timer); signal?.removeEventListener("abort", abort); resolve(completed); };
    const abort = () => finish(false);
    const timer = setTimeout(() => finish(true), delay);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
/** Pure, per-instance browser state. No storage, cookies, fetch, native imports or credentials. */
export function createMockService(): FrontendService {
  const instance = `synthetic-preview-${++instances}`;
  let revision = 0;
  const identity = (): ContextIdentity => Object.freeze({ mode: "mock", instance, revision });
  const result = (): ServiceResult<MockContext> => {
    const current = identity();
    return { kind: "success", value: Object.freeze({ identity: current, label: "Synthetic workspace", account: null, group: null }), context: current };
  };
  return Object.freeze({ mode: "mock", context: Object.freeze({
    initialIdentity: identity(),
    async read(options: RequestOptions = {}): Promise<ServiceResult<MockContext>> {
      const selection = selectDemo("mock", options.scenario);
      if (selection.kind === "failure") return selection;
      const before = identity();
      if (!await wait(scenarioDelays[selection.value.scenario], options.signal)) return cancelled();
      if (!sameContext(before, identity())) return stale();
      if (selection.value.scenario === "unavailable") return { kind: "failure", error: { code: "demo_unavailable", message: "The synthetic preview is unavailable for this request. Choose Ready and retry.", retryable: true } };
      return result();
    },
    async reset(expected: ContextIdentity, options: Pick<RequestOptions, "signal"> = {}): Promise<ServiceResult<MockContext>> {
      if (options.signal?.aborted) return cancelled();
      const before = identity();
      if (!sameContext(expected, before)) return stale();
      if (!await wait(scenarioDelays.ready, options.signal)) return cancelled();
      if (!sameContext(before, identity())) return stale();
      revision++;
      return result();
    },
  }) });
}
