import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,expect,it,vi } from "vitest";
import { GroupManagementPanel } from "../../app/group/management-panel";
const initial={groupId:"group",contextKey:"c".repeat(64),generation:1,canManage:true,activeMemberId:"owner",members:[{id:"owner",name:"Creator",color:"#1d4ed8",status:"active" as const,generation:1,owner:true},{id:"member",name:"Participant",color:"#6d28d9",status:"active" as const,generation:1,owner:false},{id:"inactive",name:"Past participant",color:"#0f766e",status:"removed" as const,generation:1,owner:false}]};
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("shows actual status/color and exposes controls only for creator and nonowner active targets",()=>{
  const {rerender}=render(<GroupManagementPanel initial={{...initial,canManage:false,activeMemberId:"member"}}/>);expect(screen.getByText("Past participant")).toBeTruthy();expect(screen.queryByRole("button",{name:/Remove|Rotate/})).toBeNull();
  rerender(<GroupManagementPanel initial={initial}/>);expect(screen.getByRole("button",{name:"Remove Participant"})).toBeTruthy();expect(screen.queryByRole("button",{name:"Remove Creator"})).toBeNull();expect(screen.queryByRole("button",{name:"Remove Past participant"})).toBeNull();
});
it("requires named confirmation, cancel writes nothing, suppresses duplicate submit and reflects inactive server state",async()=>{
  let finish!:(value:unknown)=>void;const fetcher=vi.fn((_url:string,_options:RequestInit)=>new Promise(resolve=>{finish=resolve;}));vi.stubGlobal("fetch",fetcher);render(<GroupManagementPanel initial={initial}/>);
  fireEvent.click(screen.getByRole("button",{name:"Remove Participant"}));expect(screen.getByRole("heading",{name:"Remove Participant?"})).toBe(document.activeElement);expect(screen.getByText(/Their saved titles, contributions and personal history stay/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Cancel"}));expect(fetcher).not.toHaveBeenCalled();expect(screen.queryByRole("button",{name:"Confirm removal"})).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Remove Participant"}));fireEvent.click(screen.getByRole("button",{name:"Confirm removal"}));fireEvent.click(screen.getByRole("button",{name:"Confirm removal"}));expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetcher.mock.calls[0][1].body as string)).toEqual({contextKey:initial.contextKey,memberId:"member",membershipGeneration:1});
  finish({ok:true,json:async()=>({...initial,outcome:"removed",members:initial.members.map(member=>member.id==="member"?{...member,status:"removed"}:member)})});await screen.findByText(/Participant is now inactive/);expect(screen.queryByRole("button",{name:"Remove Participant"})).toBeNull();
});
it("rotation confirms old links, preserves pending intent on failure and reveals only committed one-off link with fallback/departure clearing",async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce({ok:false,json:async()=>({error:"Context changed. Reload group."})}).mockResolvedValueOnce({ok:true,json:async()=>({...initial,generation:2,inviteUrl:"https://watch.example/invite/SYNTHETIC_PRIVATE_LINK"})});vi.stubGlobal("fetch",fetcher);
  render(<GroupManagementPanel initial={initial}/>);fireEvent.click(screen.getByRole("button",{name:"Rotate invite"}));expect(screen.getByText(/All old invitation links and pending joins/)).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"Confirm rotation"}));await screen.findByRole("alert");expect(screen.getByRole("link",{name:"Reload group"}).getAttribute("href")).toBe("/group");expect(screen.queryByLabelText("New invite link")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Confirm rotation"}));await screen.findByLabelText("New invite link");expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({contextKey:initial.contextKey,expectedGeneration:1});
  fireEvent.click(screen.getByRole("button",{name:"Copy new invite link"}));await screen.findByText("Select the link and copy it manually.");fireEvent(window,new Event("pagehide"));await waitFor(()=>expect(screen.queryByLabelText("New invite link")).toBeNull());fireEvent(window,new Event("pageshow"));expect(screen.queryByLabelText("New invite link")).toBeNull();
});
