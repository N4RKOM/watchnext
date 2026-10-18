import { getActiveGroup, getGroupRequest } from "../../lib/access";
import { getDatabase } from "../../db/server";
import { getProfileView } from "../../lib/profiles";
import { AccessErrorMessage } from "../components/access-error";
import { ProfilePanel } from "./profile-panel";
import { profileAction } from "./actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function GroupPage() {
  let group;
  let view;
  try { group = await getActiveGroup(); view = getProfileView(getDatabase(), await getGroupRequest()); } catch { return <AccessErrorMessage />; }
  return <div className="page-content">
    <div className="page-heading"><p className="eyebrow">You’re in good company</p><h1 className="saved-group-name">{group.groupName}</h1><p className="page-introduction">Welcome to your group.</p></div>
    <p>{group.mode === "account" ? "Account group · Your identity is your account membership." : "Legacy group · Names are trusted profiles."} <Link href="/account">Account groups and access mode</Link></p>
    {group.mode === "account" ? <section className="placeholder"><h2>Group members</h2><p>You’re participating as {view.members.find(member=>member.id===group.activeMemberId)?.name}.</p><ul>{view.members.map(member=><li key={member.id}>{member.name}{member.id===group.activeMemberId ? " · You" : ""}</li>)}</ul><Link href="/watchlist">Open shared watchlist</Link></section> : <ProfilePanel key={group.groupId} initial={view} action={profileAction.bind(null,group.contextKey)} />}
  </div>;
}
