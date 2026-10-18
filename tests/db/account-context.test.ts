// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { cpSync,mkdtempSync,readdirSync,readFileSync,rmSync,writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename,dirname,join,resolve } from "node:path";
import { expect,it } from "vitest";
import { migrate,migrationDirectory } from "../../db/migrate";
function fixture(check:(db:DatabaseSync,directory:string)=>void){const root=mkdtempSync(join(tmpdir(),"watchnext-context-migration-")),db=new DatabaseSync(join(root,"fixture.sqlite"));try{const directory=join(root,"migrations");for(const file of readdirSync(migrationDirectory).filter(file=>/^000[1-4]_/.test(file)))cpSync(join(migrationDirectory,file),join(directory,file));migrate(db,directory);db.exec(`INSERT INTO accounts(id,username,username_key,password_version,password_algorithm,password_hash,password_salt,password_n,password_r,password_p,password_maxmem,recovery_digest) VALUES ('a','Account','account',1,'scrypt','${"a".repeat(128)}','${"b".repeat(32)}',131072,8,1,268435456,'${"c".repeat(64)}');
INSERT INTO groups(id,name) VALUES ('legacy','Legacy');INSERT INTO groups(id,name,access_mode,owner_account_id) VALUES ('auth','Account group','account','a');
INSERT INTO invitations(id,group_id,token_hash) VALUES ('invite','legacy','synthetic');
INSERT INTO members(id,group_id,name,name_key,avatar_color) VALUES ('old','legacy','Old','old','#1d4ed8'),('member','auth','Account','account','#1d4ed8');
INSERT INTO account_memberships(account_id,group_id,member_id,joined_invite_generation) VALUES ('a','auth','member',1);
INSERT INTO account_sessions(token_hash,account_id,created_at,expires_at) VALUES ('${"d".repeat(64)}','a',100,1000);
INSERT INTO group_sessions(token_hash,group_id,invitation_id,active_member_id) VALUES ('${"e".repeat(64)}','legacy','invite','old');
INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style) VALUES ('t','legacy','Old movie','old movie','movie',100,'none');
INSERT INTO contributors(group_id,title_id,member_id) VALUES ('legacy','t','old');INSERT INTO notes VALUES ('legacy','t','old','Keep history');`);check(db,directory);}finally{db.close();if(dirname(resolve(root))!==resolve(tmpdir())||!basename(root).startsWith("watchnext-context-migration-"))throw new Error("Unsafe cleanup");rmSync(root,{recursive:true,force:true});}}
const original=(db:DatabaseSync)=>Object.fromEntries(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map(row=>[row.name as string,db.prepare(`SELECT * FROM "${row.name}" ORDER BY rowid`).all()]));
it("adds context/intent storage without changing any original business or credential value; revisions are monotonic and FKs reject orphans",()=>fixture((db,files)=>{
  const before=original(db);cpSync(join(migrationDirectory,"0005_account_context.sql"),join(files,"0005_account_context.sql"));expect(migrate(db,files)).toEqual(["0005_account_context.sql"]);
  for(const[table,rows]of Object.entries(before)){const columns=db.prepare(`PRAGMA table_info("${table}")`).all().map(row=>row.name as string).filter(name=>!["context_revision","selected_group_id"].includes(name));const result=db.prepare(`SELECT ${columns.map(name=>`"${name}"`).join(",")} FROM "${table}" ORDER BY rowid${table==="schema_migrations"?" LIMIT 4":""}`).all();expect(result).toEqual(rows);}
  expect(db.prepare("SELECT selected_group_id,context_revision FROM account_sessions").get()).toEqual({selected_group_id:null,context_revision:0});
  expect(()=>db.exec("UPDATE account_sessions SET selected_group_id='missing',context_revision=1")).toThrow();
  db.exec("UPDATE account_sessions SET selected_group_id='auth',context_revision=1");expect(()=>db.exec("UPDATE account_sessions SET context_revision=0")).toThrow();expect(()=>db.exec("UPDATE group_sessions SET context_revision=0")).toThrow();
  expect(()=>db.prepare("INSERT INTO pending_group_invitations VALUES (?,?,?)").run("a".repeat(64),"missing",100)).toThrow();
  expect(migrate(db,files)).toEqual([]);expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
}));
it("failed context DDL rolls back all columns/tables/ledger and safely retries",()=>fixture((db,files)=>{
  const before=original(db),source=readFileSync(join(migrationDirectory,"0005_account_context.sql"),"utf8"),target=join(files,"0005_account_context.sql");
  writeFileSync(target,source+"\nINVALID SQL;");expect(()=>migrate(db,files)).toThrow();expect(original(db)).toEqual(before);
  expect(db.prepare("PRAGMA table_info(account_sessions)").all().some(row=>row.name==="context_revision")).toBe(false);
  writeFileSync(target,source);expect(migrate(db,files)).toEqual(["0005_account_context.sql"]);
}));
