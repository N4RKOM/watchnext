// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { migrate } from "../../db/migrate";
import { registerAccount,accountCookieName } from "../../lib/accounts/service";
import { accountSession,requestContext } from "../../lib/accounts/context";
import { security } from "../../lib/accounts/security";
import { beginAccountInvite,pendingInviteCookieName } from "../../lib/accounts/groups";
const mocks=vi.hoisted(()=>({database:vi.fn()}));vi.mock("../../db/server",()=>({getDatabase:mocks.database}));
import { POST } from "../../app/api/groups/[operation]/route";
let db:DatabaseSync,a:string,b:string;
const origin="http://127.0.0.1:3000",password="Synthetic account password";
const request=(token=a,body:unknown={},headers={})=>new Request(origin,{method:"POST",headers:{origin,"content-type":"application/json",cookie:`${accountCookieName}=${token}`,...headers},body:JSON.stringify(body)});
const call=(operation:string,req:Request)=>POST(req,{params:Promise.resolve({operation})});
beforeEach(async()=>{db=new DatabaseSync(":memory:");migrate(db);mocks.database.mockReturnValue(db);security.signupTotal.clear("all");a=(await registerAccount(db,{username:"Group.HttpA",password,confirmation:password})).credential;b=(await registerAccount(db,{username:"Group.HttpB",password,confirmation:password})).credential;});
afterEach(()=>{db.close();vi.clearAllMocks();});
it("real create/join/switch JSON operations set explicit private mode, derive identities and clear consumed intents",async()=>{
  const created=await call("create",request(a,{groupName:"Private group",revision:0}));expect(created.status).toBe(200);expect(created.headers.get("cache-control")).toBe("private, no-store");expect(created.headers.get("set-cookie")).toContain("watchnext_access_mode=account");const group=await created.json();
  const intent=beginAccountInvite(db,group.inviteUrl.split("/").at(-1));
  const joined=await call("join",request(b,{revision:0},{cookie:`${accountCookieName}=${b}; ${pendingInviteCookieName}=${intent}`}));expect(joined.status).toBe(200);expect(joined.headers.get("set-cookie")).toContain(`${pendingInviteCookieName}=`);expect(joined.headers.get("set-cookie")).toContain("Max-Age=0");
  const result=await joined.json();expect(result.groups[0].memberId).not.toBe(group.groups[0].memberId);expect(result.groups[0].owner).toBe(false);
  const switched=await call("switch",request(b,{groupId:group.selectedGroupId,revision:result.revision}));expect(switched.status).toBe(200);expect((await switched.json()).revision).toBe(2);
});
it("denies unknown/duplicate/tampered/expired cookies, foreign groups, forged IDs, stale revisions and unsafe origins without partial writes",async()=>{
  const created=await(await call("create",request(a,{groupName:"Guarded",revision:0}))).json();const before=JSON.stringify(db.prepare("SELECT * FROM groups").all());
  for(const req of [request("tampered",{groupName:"Denied",revision:0}),request(a,{groupName:"Denied",revision:1,accountId:"other"}),request(a,{groupName:"Denied",revision:1},{origin:"https://foreign.example"}),request(a,{groupName:"Denied",revision:1},{origin:""}),request(a,{groupName:"Denied",revision:1},{cookie:`${accountCookieName}=${a}; ${accountCookieName}=${a}`})])expect((await call("create",req)).status).toBe(400);
  expect((await call("switch",request(b,{groupId:created.selectedGroupId,revision:0}))).status).toBe(400);
  expect((await call("create",request(a,{groupName:"Stale",revision:0}))).status).toBe(400);
  db.prepare("UPDATE account_sessions SET created_at=created_at-1000000,expires_at=created_at-1 WHERE token_hash=?").run(accountSession(db,request(a)).tokenHash);
  expect((await call("create",request(a,{groupName:"Expired",revision:1}))).status).toBe(400);
  expect(JSON.stringify(db.prepare("SELECT * FROM groups").all())).toBe(before);
});
