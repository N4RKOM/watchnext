import { DatabaseSync } from "node:sqlite";
import { mkdirSync,copyFileSync,readdirSync } from "node:fs";
import { join } from "node:path";
import { migrate,migrationDirectory } from "../../db/migrate.ts";
/** Upgrade representative populated pre-account data through every current migration. */
export function verifyLegacyUpgrade(root){
 const files=join(root,"legacy-migrations");mkdirSync(files);const db=new DatabaseSync(join(root,"populated-legacy.sqlite"));
 try{
  for(const name of readdirSync(migrationDirectory).filter(name=>/^000[1-3]_/.test(name)))copyFileSync(join(migrationDirectory,name),join(files,name));
  migrate(db,files);
  db.exec(`INSERT INTO groups(id,name) VALUES ('legacy','Original legacy'),('empty','Empty legacy');
    INSERT INTO invitations(id,group_id,token_hash,revoked_at) VALUES ('invite','legacy','synthetic-old-hash','2026-10-01');
    INSERT INTO members(id,group_id,name,name_key,avatar_color) VALUES ('old','legacy','Original Name','original name','#1d4ed8');
    INSERT INTO group_sessions(token_hash,group_id,invitation_id,active_member_id) VALUES ('${"d".repeat(64)}','legacy','invite','old');
    INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style,provider_namespace,provider_id,archived)
      VALUES ('title','legacy','Original','original','youtube',1440,'none','youtube','Synthetic01',1);
    INSERT INTO contributors(group_id,title_id,member_id) VALUES ('legacy','title','old');
    INSERT INTO title_moods VALUES ('title','funny'); INSERT INTO title_genres VALUES ('title','comedy','Comedy');
    INSERT INTO progress(group_id,title_id,member_id,numbering_style,timestamp_seconds,completed) VALUES ('legacy','title','old','none',7,1);
    INSERT INTO ratings VALUES ('legacy','title','old',8); INSERT INTO notes VALUES ('legacy','title','old','Original note');
    INSERT INTO metadata_fields(title_id,field,origin,retrieved_at,expires_at) VALUES ('title','duration','provider','2026-10-01','2026-10-31');
    INSERT INTO metadata_reviews(handle_hash,group_id,member_id,session_id,expires_at,payload)
      VALUES ('synthetic-review-hash','legacy','old','synthetic-session-binding','2026-10-31','{"synthetic":true}');`);
  const oldTables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map(({name})=>({name,columns:db.prepare(`PRAGMA table_info("${name}")`).all().map(row=>row.name),rows:db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()}));
  const versions=migrate(db);if(versions.length!==2)throw new Error("Expected both additive account migrations");
  for(const {name,columns,rows}of oldTables){const actual=db.prepare(`SELECT ${columns.map(name=>'"'+name+'"').join(',')} FROM "${name}" ORDER BY rowid${name==='schema_migrations'?' LIMIT 3':''}`).all();if(JSON.stringify(actual)!==JSON.stringify(rows))throw new Error("Original legacy business values/IDs/ledger changed");}
  if(db.prepare("SELECT 1 FROM groups WHERE access_mode<>'legacy' OR owner_account_id IS NOT NULL").get()||db.prepare("SELECT 1 FROM accounts").get()||db.prepare("SELECT 1 FROM account_memberships").get()||db.prepare("PRAGMA foreign_key_check").all().length||migrate(db).length)throw new Error("Legacy isolation or repeat migration failed");
 }finally{db.close();}
}
