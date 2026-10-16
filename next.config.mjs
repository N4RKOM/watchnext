/** Bearer credentials occur in invite paths and action state; routine logs must omit them. */
export default function config(phase) {
  if (["phase-development-server", "phase-production-server"].includes(phase) &&
      process.env.NEXT_TRACE_SPAN_THRESHOLD_MS !== "9007199254740991") {
    throw new Error("Start WatchNext with pnpm dev or pnpm start so credential-safe framework tracing is configured before startup.");
  }
  return {
    // Bound page/static build workers on memory-constrained academic machines.
    experimental: { cpus: 2 },
    logging: { incomingRequests: false, serverFunctions: false, browserToTerminal: false },
  };
}
