"use client";
import { useEffect,useRef,useState } from "react";
import type { GroupManagement } from "../../lib/accounts/management";
import { initials } from "../../lib/profile-state";
type Confirmation={kind:"remove";member:GroupManagement["members"][number]}|{kind:"rotate";generation:number};
export function GroupManagementPanel({initial}:{initial:GroupManagement}) {
  const [view,setView]=useState(initial),[confirmation,setConfirmation]=useState<Confirmation|null>(null),[pending,setPending]=useState(false);
  const [invite,setInvite]=useState<string|null>(null),[message,setMessage]=useState(""),[failed,setFailed]=useState(false),[copyMessage,setCopyMessage]=useState("");
  const busy=useRef(false),feedback=useRef<HTMLParagraphElement>(null),confirmHeading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{setView(initial);setConfirmation(null);setInvite(null);},[initial]);
  useEffect(()=>{if(confirmation)confirmHeading.current?.focus();},[confirmation]);
  useEffect(()=>{const clear=()=>{const field=document.getElementById("rotated-invite");if(field instanceof HTMLInputElement)field.value="";setInvite(null);setConfirmation(null);};window.addEventListener("pagehide",clear);window.addEventListener("pageshow",clear);return()=>{window.removeEventListener("pagehide",clear);window.removeEventListener("pageshow",clear);};},[]);
  async function confirm() {
    if(busy.current||!confirmation)return;busy.current=true;setPending(true);setMessage("");setFailed(false);setInvite(null);setCopyMessage("");
    const intent=confirmation;
    try {
      const body=intent.kind==="remove"?{contextKey:view.contextKey,memberId:intent.member.id,membershipGeneration:intent.member.generation}:{contextKey:view.contextKey,expectedGeneration:intent.generation};
      const response=await fetch(`/api/groups/${intent.kind}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"});
      const result=await response.json();
      if(!response.ok){setFailed(true);setMessage(result.error||"We couldn’t confirm the change. Reload this group before trying again.");return;}
      setView(result);setConfirmation(null);
      if(intent.kind==="rotate"){setInvite(result.inviteUrl);setMessage("Invitation rotated. Save the new private link; old links no longer work.");}
      else setMessage(result.outcome==="already_removed"?`${intent.member.name} is already inactive. Their history is preserved.`:`${intent.member.name} is now inactive. Their access is removed; titles and history are preserved.`);
    }catch{setFailed(true);setMessage("We couldn’t confirm the change. Reload this group to check before trying again.");}
    finally{busy.current=false;setPending(false);setTimeout(()=>feedback.current?.focus(),0);}
  }
  async function copy(){try{if(!navigator.clipboard?.writeText)throw new Error();await navigator.clipboard.writeText(invite!);setCopyMessage("Invite link copied.");}catch{setCopyMessage("Select the link and copy it manually.");}}
  return <section className="placeholder" aria-labelledby="group-members-heading"><h2 id="group-members-heading">Group members</h2><p>You’re participating as {view.members.find(member=>member.id===view.activeMemberId)?.name}.</p>
    <ul>{view.members.map(member=><li key={member.id}><span className="avatar" style={{backgroundColor:member.color}} aria-hidden="true">{initials(member.name)}</span>{" "}<span className="profile-name">{member.name}</span>{member.owner?" · Creator":""}{member.id===view.activeMemberId?" · You":""}{member.status==="removed"?" · Inactive":" · Active"}{" "}
      {view.canManage&&!member.owner&&member.status==="active"&&<button className="button button-secondary" disabled={pending} onClick={()=>{setInvite(null);setMessage("");setConfirmation({kind:"remove",member});}}>Remove {member.name}</button>}</li>)}</ul>
    {view.canManage&&<><h3>Private invitation</h3><p>Rotate the invitation to stop old links. Existing active members keep access. A removed participant needs an invitation rotated after their removal to rejoin.</p><button className="button button-secondary" disabled={pending} onClick={()=>{setInvite(null);setMessage("");setConfirmation({kind:"rotate",generation:view.generation});}}>Rotate invite</button></>}
    {confirmation&&<section className="placeholder" aria-labelledby="management-confirmation"><h3 id="management-confirmation" ref={confirmHeading} tabIndex={-1}>{confirmation.kind==="remove"?`Remove ${confirmation.member.name}?`:"Rotate private invitation?"}</h3>
      <p>{confirmation.kind==="remove"?`${confirmation.member.name} will lose access in every browser. Their saved titles, contributions and personal history stay in the group.`:"All old invitation links and pending joins will stop working. Existing active members keep access. Save the new link when it appears; it cannot be retrieved later."}</p>
      <button className="button" disabled={pending} onClick={confirm}>{confirmation.kind==="remove"?"Confirm removal":"Confirm rotation"}</button>{" "}<button className="button button-secondary" disabled={pending} onClick={()=>{setConfirmation(null);setMessage("No changes made.");setTimeout(()=>feedback.current?.focus(),0);}}>Cancel</button></section>}
    {pending&&<p role="status">Updating group access…</p>}{message&&<p role={failed?"alert":"status"} tabIndex={-1} ref={feedback}>{message}</p>}{failed&&<a href="/group">Reload group</a>}
    {invite&&<section aria-labelledby="rotated-invite-heading"><h3 id="rotated-invite-heading">New private invitation</h3><p>This link works only on this computer when using localhost or 127.0.0.1. Save it now; leaving or reloading clears it.</p><label className="field-label" htmlFor="rotated-invite">New invite link</label><input id="rotated-invite" className="field" readOnly value={invite} onFocus={event=>event.currentTarget.select()}/><button className="button button-secondary" onClick={copy}>Copy new invite link</button><p role="status">{copyMessage}</p></section>}
    <p><a href="/watchlist">Open shared watchlist</a></p>
  </section>;
}
