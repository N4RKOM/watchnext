// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { getDatabase } from "../db/server";
import { getGroupRequest } from "../lib/access";
import { migrate } from "../db/migrate";
import { createGroup } from "../lib/groups";
import { acceptInvitation, sessionCookieName, requireSession } from "../lib/sessions";
import { changeProfile } from "../lib/profiles";
import { saveTitle } from "../lib/shared-save";
import { contributionAction } from "../app/watchlist/contribution-actions";
vi.mock("../db/server",()=>({getDatabase:vi.fn()}));vi.mock("../lib/access",()=>({getGroupRequest:vi.fn()}));vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));vi.mock("next/navigation",()=>({redirect:vi.fn(()=>{throw new Error("FIXTURE_REDIRECT");})}));
let db:DatabaseSync,id:string,member:string;
beforeEach(()=>{
  db=new DatabaseSync(":memory:");migrate(db);vi.mocked(getDatabase).mockReturnValue(db);const origin="https://watch.example";vi.stubEnv("WATCHNEXT_APP_ORIGIN",origin);const credential=acceptInvitation(db,createGroup(db,"A",origin).inviteUrl.split("/").at(-1)!);const request=new Request(origin,{method:"POST",headers:{origin,cookie:`${sessionCookieName}=${credential}`}});vi.mocked(getGroupRequest).mockResolvedValue(request);changeProfile(db,request,{intent:"create",name:"Anna",color:"#1d4ed8"},origin);member=requireSession(db,credential).activeMemberId!;const result=saveTitle(db,request,{kind:"manual",fields:{title:"Film",contentType:"movie",minutes:"90",seconds:"",numberingStyle:"none",genres:"",moods:["funny"],watchUrl:""}},origin);if(!result.id)throw new Error("Fixture failed");id=result.id;
});afterEach(()=>{db.close();vi.clearAllMocks();vi.unstubAllEnvs();});
const form=(intent:string)=>{const value=new FormData();value.set("intent",intent);value.set("memberId",member);return value;};
it("requires confirmed removal, returns safe removal/no-op, and restores once with real destination",async()=>{
  expect((await contributionAction(undefined, id,{kind:"idle"},form("remove"))).kind).toBe("error");expect((await contributionAction(undefined, id,{kind:"idle"},form("remove_confirm"))).kind).toBe("success");expect((await contributionAction(undefined, id,{kind:"idle"},form("remove_confirm"))).kind).toBe("success");await expect(contributionAction(undefined, id,{kind:"idle"},form("restore"))).rejects.toThrow("FIXTURE_REDIRECT");expect(redirect).toHaveBeenCalledWith(`/watchlist/${id}?contribution=saved`);await expect(contributionAction(undefined, id,{kind:"idle"},form("restore"))).rejects.toThrow("FIXTURE_REDIRECT");expect(db.prepare("SELECT count(*) AS n FROM contributors WHERE title_id=?").get(id)?.n).toBe(1);
});
it("returns generic retry context on storage failure and denies other-member claims without deleting",async()=>{
  const forged=form("remove_confirm");forged.set("memberId","somebody-else");expect((await contributionAction(undefined, id,{kind:"idle"},forged)).kind).toBe("error");db.exec("CREATE TEMP TRIGGER fixture_failure BEFORE DELETE ON contributors BEGIN SELECT RAISE(ABORT,'PRIVATE_FIXTURE'); END");const result=await contributionAction(undefined, id,{kind:"idle"},form("remove_confirm"));expect(result.kind).toBe("error");expect(JSON.stringify(result)).not.toContain("PRIVATE_FIXTURE");expect(db.prepare("SELECT count(*) AS n FROM contributors WHERE title_id=?").get(id)?.n).toBe(1);
});
