import { initializeDatabase } from "../../db/connection.ts";

try {
  if (process.argv.length > 2) throw new Error("Configure WATCHNEXT_DATABASE_PATH rather than passing database arguments");
  const result = initializeDatabase();
  console.log(`PASS: initialized ${result.path}`);
  console.log(`Applied: ${result.applied.join(", ") || "none; existing data preserved"}`);
} catch (error) {
  console.error("FAIL:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
