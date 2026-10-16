// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { getDatabase } from "../db/server";
import { getGroupRequest } from "../lib/access";
import { migrate } from "../db/migrate";
import { createGroup } from "../lib/groups";
import { acceptInvitation, sessionCookieName } from "../lib/sessions";
import { changeProfile } from "../lib/profiles";
import { saveTitle } from "../lib/shared-save";
import { readEditableTitle } from "../lib/edit-title";
import { editTitleAction } from "../app/watchlist/[id]/edit/actions";
vi.mock("../db/server", () => ({ getDatabase: vi.fn() }));vi.mock("../lib/access", () => ({ getGroupRequest: vi.fn() }));vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("FIXTURE_REDIRECT"); }) }));
let db: DatabaseSync, id: string, request: Request;
beforeEach(() => {
  db = new DatabaseSync(":memory:");migrate(db);vi.mocked(getDatabase).mockReturnValue(db);const origin="https://watch.example";vi.stubEnv("WATCHNEXT_APP_ORIGIN",origin);
  const credential=acceptInvitation(db,createGroup(db,"A",origin).inviteUrl.split("/").at(-1)!);request=new Request(origin,{method:"POST",headers:{origin,cookie:`${sessionCookieName}=${credential}`}});vi.mocked(getGroupRequest).mockResolvedValue(request);changeProfile(db,request,{intent:"create",name:"Anna",color:"#1d4ed8"},origin);
  const result=saveTitle(db,request,{kind:"manual",fields:{title:"Film",contentType:"movie",minutes:"90",seconds:"",numberingStyle:"none",genres:"",moods:["funny"],watchUrl:""}},origin);if(!result.id)throw new Error("Fixture setup failed");id=result.id;
});
afterEach(()=>{db.close();vi.clearAllMocks();vi.unstubAllEnvs();});
function form(){const model=readEditableTitle(db,request,id),data=new FormData();for(const[key,value]of Object.entries(model.values))data.set(key,value);for(const mood of model.moods)data.append("moods",mood);data.set("revision",model.revision);return data;}
it("saves valid edits then navigates to the actual detail route",async()=>{const data=form();data.set("minutes","60");await expect(editTitleAction(id,{kind:"idle"},data)).rejects.toThrow("FIXTURE_REDIRECT");expect(redirect).toHaveBeenCalledWith(`/watchlist/${id}`);expect(db.prepare("SELECT duration_seconds FROM titles WHERE id=?").get(id)?.duration_seconds).toBe(3600);});
it("maps validation to source/cover fields and preserves prior values after safe storage failure",async()=>{
  const data=form();data.set("sourceUrl","javascript:x");expect(await editTitleAction(id,{kind:"idle"},data)).toMatchObject({kind:"invalid",errors:{sourceUrl:expect.any(String)}});
  db.exec("CREATE TEMP TRIGGER fixture_failure BEFORE INSERT ON title_moods BEGIN SELECT RAISE(ABORT,'PRIVATE_FIXTURE'); END");const retry=form();retry.set("minutes","60");const result=await editTitleAction(id,{kind:"idle"},retry);expect(result.kind).toBe("error");expect(JSON.stringify(result)).not.toContain("PRIVATE_FIXTURE");expect(db.prepare("SELECT duration_seconds FROM titles WHERE id=?").get(id)?.duration_seconds).toBe(5400);
});
it("rejects provider tampering, returns explicit identity confirmation and stale revision feedback",async()=>{
  const tamper=form();tamper.set("providerId","stolen");expect((await editTitleAction(id,{kind:"idle"},tamper)).kind).toBe("error");
  const stale=form(),data=form();data.set("title","New identity");expect(await editTitleAction(id,{kind:"idle"},data)).toMatchObject({kind:"confirmation",confirmation:expect.any(String)});
  db.prepare("UPDATE titles SET duration_seconds=60 WHERE id=?").run(id);expect((await editTitleAction(id,{kind:"idle"},stale)).kind).toBe("stale");
});
