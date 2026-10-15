// Pinned Next 16.4.1 reads this before loading its tracer. Suppress routine span
// recording because request paths contain invitation capabilities. This is an
// internal runtime hook: reverify it, console logs, and trace files on upgrades.
process.env.NEXT_TRACE_SPAN_THRESHOLD_MS = "9007199254740991";
