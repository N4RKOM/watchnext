import { verifySchema } from "./check.mjs";

try {
  if (process.argv.length > 2) throw new Error("No path arguments accepted; verification always uses an isolated temporary database");
  const results = verifySchema();
  for (const result of results) console.log(`PASS: ${result}`);
  console.log(`PASS: ${results.length} schema checks; temporary fixture database removed; normal databases untouched.`);
} catch (error) {
  console.error("FAIL:", error);
  process.exitCode = 1;
}
