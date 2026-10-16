import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ContributionControls } from "../app/watchlist/contribution-controls";
import { WatchlistContent } from "../app/watchlist/watchlist-view";
import Loading from "../app/archive/loading";
import type { ContributionState } from "../lib/contribution-state";
afterEach(cleanup);
it("requires visible removal confirmation, cancels without action, then announces success",async()=>{
  const action=vi.fn().mockResolvedValue({kind:"success",message:"Own contribution removed"});render(<ContributionControls archived={false} canRemove memberId="anna" action={action}/>);fireEvent.click(screen.getByRole("button",{name:"Remove my contribution"}));expect(screen.getByText(/If nobody remains/)).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"Cancel removal"}));expect(action).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Remove my contribution"}));fireEvent.click(screen.getByRole("button",{name:"Confirm removal"}));await screen.findByText("Own contribution removed");expect(action.mock.calls[0][1].get("memberId")).toBe("anna");expect(action.mock.calls[0][1].get("intent")).toBe("remove_confirm");
});
it("preserves confirmation for safe error/retry and disables in-flight writes",async()=>{
  let finish!:(state:ContributionState)=>void;const action=vi.fn(()=>new Promise<ContributionState>(resolve=>{finish=resolve;}));render(<ContributionControls archived={false} canRemove memberId="anna" action={action}/>);fireEvent.click(screen.getByRole("button",{name:"Remove my contribution"}));fireEvent.click(screen.getByRole("button",{name:"Confirm removal"}));const pending=await screen.findByRole("button",{name:"Removing…"});expect(pending.closest("fieldset")?.disabled).toBe(true);fireEvent.click(pending);expect(action).toHaveBeenCalledTimes(1);finish({kind:"error",message:"Try again fixture"});await screen.findByRole("alert");expect(screen.getByRole("button",{name:"Confirm removal"})).toBeTruthy();
});
it("offers real restoration or profile navigation and distinct archive empty/loading states",()=>{
  const action=async()=>({kind:"idle" as const});const shown=render(<ContributionControls archived canRemove={false} memberId={null} action={action}/>);expect(screen.getByRole("link",{name:"Choose profile to restore"}).getAttribute("href")).toBe("/group");shown.rerender(<ContributionControls archived canRemove={false} memberId="anna" action={action}/>);expect(screen.getByRole("button",{name:"Restore to watchlist"})).toBeTruthy();shown.unmount();const empty=render(<WatchlistContent view={{activeMemberId:null,items:[]}} archived/>);expect(screen.getByRole("heading",{name:"Your archive is empty"})).toBeTruthy();empty.unmount();render(<Loading/>);expect(screen.getByRole("status").textContent).toBe("Loading your archive…");
});
