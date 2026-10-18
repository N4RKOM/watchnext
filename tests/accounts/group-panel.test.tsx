import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {AccountGroupPanel} from "../../app/account/group-panel";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const initial={username:"Account.One",selectedGroupId:null,revision:0,groups:[]};
it("shows real empty/pending/error and retry context without fabricated memberships or owner controls",async()=>{
  let finish!:(result:unknown)=>void;const fetcher=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));vi.stubGlobal("fetch",fetcher);
  render(<AccountGroupPanel initial={initial} pendingInvite={null}/>);expect(screen.getByText(/haven’t joined/)).toBeTruthy();expect(screen.queryByRole("button",{name:/Remove participant|Rotate/})).toBeNull();
  fireEvent.change(screen.getByLabelText("New group name"),{target:{value:"My actual group"}});const form=screen.getByRole("button",{name:"Create account group"}).closest("form")!;fireEvent.submit(form);fireEvent.submit(form);expect(fetcher).toHaveBeenCalledTimes(1);expect(screen.getByText("Updating your group…")).toBeTruthy();
  finish({ok:false,json:async()=>({error:"Reload your account and try again."})});await screen.findByRole("alert");expect((screen.getByLabelText("New group name") as HTMLInputElement).value).toBe("My actual group");expect(screen.getByRole("link",{name:"Reload account"}).getAttribute("href")).toBe("/account");
});
it("only displays server-returned invitation/membership and supports copy fallback, departure clearing and current context",async()=>{
  const view={...initial,revision:1,selectedGroupId:"group",groups:[{id:"group",name:"Real group",owner:true,memberId:"member"}]};
  const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({...view,inviteUrl:"https://watch.example/invite/SYNTHETIC_PRIVATE_LINK"})});vi.stubGlobal("fetch",fetcher);
  const {rerender}=render(<AccountGroupPanel initial={initial} pendingInvite={{available:true,name:"Invited group"}}/>);expect(screen.getByRole("button",{name:"Join Invited group"})).toBeTruthy();
  fireEvent.change(screen.getByLabelText("New group name"),{target:{value:"Real group"}});fireEvent.submit(screen.getByRole("button",{name:"Create account group"}).closest("form")!);await screen.findByLabelText("Invite link");
  expect(screen.getByRole("button",{name:"Open Real group"})).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"Copy invite link"}));await waitFor(()=>expect(screen.getByText("Select the link and copy it manually.")).toBeTruthy());
  fireEvent(window,new Event("pagehide"));expect(screen.queryByLabelText("Invite link")).toBeNull();
  rerender(<AccountGroupPanel initial={{...initial,revision:2}} pendingInvite={null}/>);await waitFor(()=>expect(screen.queryByRole("button",{name:"Open Real group"})).toBeNull());
});
