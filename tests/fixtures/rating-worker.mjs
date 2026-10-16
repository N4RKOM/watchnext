import { DatabaseSync } from "node:sqlite";
const { updateOwnRating } = await import(process.argv[2]);
const db = new DatabaseSync(process.argv[3]); db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
process.stdout.write("ready\n"); let input = "";
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  try { const job = JSON.parse(input), request = new Request(job.origin, { method: "POST", headers: { origin: job.origin, cookie: `watchnext_session=${job.credential}` } }); const result = updateOwnRating(db, request, job.id, job.input, job.origin); process.stdout.write(JSON.stringify(result) + "\n"); }
  catch (error) { process.stderr.write(`Rating fixture failure: ${error.name}\n`); process.exitCode = 1; }
  finally { db.close(); }
});
