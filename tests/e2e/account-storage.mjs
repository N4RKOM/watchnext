import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createSnapshot } from "../../scripts/db/snapshot.mjs";
import { repo } from "./lifecycle.mjs";
const check=(value,label)=>{if(!value)throw new Error(`Authenticated storage: ${label}`);};
function rows(db){return Object.fromEntries(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map(({name})=>[name,db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]));}
const digest=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** Real UI-created account data; only the passage-of-time fixture is SQL controlled. */
export async function verifyAccountStorage(f,{page,removed,group,title,providerTitle,width}){
  // Keep one actual acquired review pending, then simulate offline expiry before snapshot.
  await page.goto(f.origin+"/watchlist/add");await page.getByLabel("Entry method").selectOption("youtube");await page.getByLabel("YouTube video link or ID").fill("YtFixture01");await page.getByRole("button",{name:"Look up video",exact:true}).press("Enter");const field=page.locator('input[name="reviewHandle"]');await field.waitFor({state:"attached"});f.secrets.push(await field.inputValue());
  await f.stop();
  const source=new DatabaseSync(f.path);let backup,restored;
  const beforePath=join(f.root,`account-backup-${width}.sqlite`),restorePath=join(f.root,`account-restored-${width}.sqlite`);
  try{
    source.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;");
    // A due deadline is the only lifecycle mutation. No password/code/session is fabricated.
    const id=source.prepare("SELECT id FROM titles WHERE title=?").get(providerTitle).id;
    source.prepare("UPDATE metadata_fields SET expires_at='2000-01-01T00:00:00.000Z' WHERE title_id=? AND origin='provider'").run(id);
    source.prepare("UPDATE metadata_reviews SET expires_at='2000-01-01T00:00:00.000Z'").run();
    const before=rows(source),sourceBytes=readFileSync(f.path),wal=readFileSync(f.path+"-wal");
    check(wal.length>32,"fixture must contain committed WAL data");check(before.accounts.length>=3&&before.account_memberships.some(row=>row.status==='removed'),"real accounts/removed membership present");
    check(before.account_sessions.some(row=>row.revoked_at!==null)&&before.account_sessions.some(row=>row.revoked_at===null),"real revoked and current sessions present");
    createSnapshot(f.path,beforePath);createSnapshot(beforePath,restorePath);
    backup=new DatabaseSync(beforePath,{readOnly:true});restored=new DatabaseSync(restorePath,{readOnly:true});
    check(JSON.stringify(rows(backup))===JSON.stringify(before)&&JSON.stringify(rows(restored))===JSON.stringify(before),"every hash, owner, member, generation, history, context and deadline preserved exactly");
    const fresh=spawnSync(process.execPath,["--input-type=module","-e",`import {DatabaseSync} from 'node:sqlite';import {createHash} from 'node:crypto';const d=new DatabaseSync(process.argv[1],{readOnly:true});const rows=Object.fromEntries(d.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map(({name})=>[name,d.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all()]));const hash=createHash('sha256').update(JSON.stringify(rows)).digest('hex');d.close();process.exit(hash===process.argv[2]?0:1);`,restorePath,digest(before)],{encoding:"utf8",windowsHide:true,timeout:15000});
    check(fresh.status===0,"fresh process sees exactly the snapshot security/business state");restored.close();restored=undefined;
    const maintenance=spawnSync(process.execPath,[join(repo,"scripts/metadata-maintain.mjs")],{cwd:repo,env:{...process.env,WATCHNEXT_DATABASE_PATH:restorePath,YOUTUBE_API_KEY:"",KINOPOISK_UNOFFICIAL_API_KEY:""},encoding:"utf8",windowsHide:true,timeout:30000});
    check(maintenance.status===0,"explicit offline restored-file maintenance passes");
    restored=new DatabaseSync(restorePath,{readOnly:true});const after=rows(restored);
    for(const table of ['accounts','account_sessions','account_memberships','groups','invitations','members','contributors','progress','ratings','notes'])check(JSON.stringify(after[table])===JSON.stringify(before[table]),`${table} unchanged by expiry maintenance`);
    check(after.metadata_reviews.length===0,"due review physically removed");const imported=restored.prepare("SELECT title,duration_seconds,cover_url FROM titles WHERE id=?").get(id);check(imported.title===providerTitle&&imported.duration_seconds===null&&imported.cover_url===null,"authored title survives; due provider runtime/cover removed");
    check(readFileSync(f.path).equals(sourceBytes)&&readFileSync(f.path+"-wal").equals(wal),"original main/WAL untouched by snapshot, restore and maintenance");
    // secure_delete + checkpoint/truncate is production maintenance behavior, checked in standalone file.
    const blob=readFileSync(restorePath);check(!blob.includes(Buffer.from('"YtFixture01"')),"expired pending review payload absent from standalone restored file");
  }finally{restored?.close();backup?.close();source.close();}
  await f.start(true,restorePath);await page.goto(f.origin+"/group");await page.getByRole("heading",{name:group,exact:true}).waitFor();await page.goto(f.origin+"/watchlist/"+title);await page.getByRole("heading",{name:/Shared account movie/,exact:false}).waitFor();await page.getByRole("region",{name:"Your rating",exact:true}).waitFor();
  await removed.goto(f.origin+"/watchlist");await removed.getByRole("heading",{name:"Group access unavailable",exact:true}).waitFor();
  await f.stop();await f.start();
}
