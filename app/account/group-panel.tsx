"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import type { accountGroups } from "../../lib/accounts/groups";
type View = ReturnType<typeof accountGroups>;
export function AccountGroupPanel({ initial, pendingInvite }: { initial: View; pendingInvite: { name:string;available:boolean } | null }) {
  const [view,setView] = useState(initial), [name,setName] = useState(""), [message,setMessage] = useState(""), [pending,setPending] = useState(false);
  const [invite,setInvite] = useState<string|null>(null), [copyMessage,setCopyMessage] = useState("");
  const busy = useRef(false), feedback = useRef<HTMLParagraphElement>(null);
  async function send(operation:string, fields:Record<string,unknown> = {}) {
    if (busy.current) return; busy.current=true;setPending(true);setMessage("");setInvite(null);
    try {
      const response=await fetch(`/api/groups/${operation}`,{ method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...fields,revision:view.revision}),cache:"no-store" });
      const result=await response.json();
      if (!response.ok) { setMessage(result.error || "We couldn’t update your group. Try again."); return; }
      setView(result);
      if (operation === "create") { setInvite(result.inviteUrl);setMessage("Group created. Save its private invitation link."); }
      else window.location.assign(operation === "legacy" ? "/" : "/group");
    } catch { setMessage("We couldn’t confirm this change. Reload your account to check before trying again."); }
    finally { busy.current=false;setPending(false);setTimeout(()=>feedback.current?.focus(),0); }
  }
  async function copy() { try { if(!navigator.clipboard?.writeText) throw new Error(); await navigator.clipboard.writeText(invite!);setCopyMessage("Invite link copied."); } catch {setCopyMessage("Select the link and copy it manually.");} }
  return <section className="placeholder"><h2>Your account groups</h2>
    <p>Account membership decides who you are in each group. Legacy name profiles remain separate.</p>
    {view.groups.length === 0 ? <p>You haven’t joined any account groups yet.</p> : <ul>{view.groups.map(group=><li key={group.id}><strong>{group.name}</strong>{group.owner ? " · Creator" : ""}{view.selectedGroupId===group.id ? " · Selected" : ""}{" "}<button className="button button-secondary" disabled={pending} onClick={()=>send("switch",{groupId:group.id})}>Open {group.name}</button></li>)}</ul>}
    <form onSubmit={event=>{event.preventDefault();void send("create",{groupName:name});}} noValidate>
      <label className="field-label" htmlFor="account-group-name">New group name</label><input id="account-group-name" className="field" value={name} onChange={event=>setName(event.target.value)} disabled={pending} aria-describedby="account-group-hint" />
      <p id="account-group-hint" className="field-hint">1–80 characters.</p><button className="button" disabled={pending}>Create account group</button>
    </form>
    <h3>Join by invitation</h3>
    {pendingInvite?.available ? <><p>You’ve been invited to <strong>{pendingInvite.name}</strong>.</p><button className="button" disabled={pending} onClick={()=>send("join")}>Join {pendingInvite.name}</button></> : pendingInvite ? <p role="status">This invitation is unavailable or expired. Open a current invitation link and try again.</p> : <p>Open a private invitation link from a group member, then confirm joining here.</p>}
    {pending && <p role="status">Updating your group…</p>}{message && <p role="status" tabIndex={-1} ref={feedback}>{message}</p>}
    {invite && <section aria-labelledby="created-account-group"><h3 id="created-account-group">Private invitation link</h3><p>Anyone with this link can request to join after signing in. On 127.0.0.1 or localhost it works only on this computer.</p><label className="field-label" htmlFor="account-invite">Invite link</label><input id="account-invite" className="field" readOnly value={invite} onFocus={event=>event.currentTarget.select()} /><button className="button button-secondary" onClick={copy}>Copy invite link</button><p role="status">{copyMessage}</p><a className="button" href="/group">Open created group</a></section>}
    <p><button className="button button-secondary" disabled={pending} onClick={()=>send("legacy")}>Use separate legacy access</button></p>
  </section>;
}
