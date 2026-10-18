import { getActiveGroup, getGroupRequest } from "../../lib/access";
import { getDatabase } from "../../db/server";
import { getProfileView } from "../../lib/profiles";
import { AccessErrorMessage } from "../components/access-error";
import { ProfilePanel } from "./profile-panel";
import { profileAction } from "./actions";
import Link from "next/link";
import { readGroupManagement } from "../../lib/accounts/management";
import { GroupManagementPanel } from "./management-panel";

export const dynamic = "force-dynamic";

export default async function GroupPage() {
  let group;
  let view;
  let management;
  try { group = await getActiveGroup(); const request=await getGroupRequest(); view = getProfileView(getDatabase(), request); if(group.mode==="account")management=readGroupManagement(getDatabase(),request); } catch { return <AccessErrorMessage />; }
  return <div className="page-content">
    <div className="page-heading"><p className="eyebrow">You’re in good company</p><h1 className="saved-group-name">{group.groupName}</h1><p className="page-introduction">Welcome to your group.</p></div>
    <p>{group.mode === "account" ? "Account group · Your identity is your account membership." : "Legacy group · Names are trusted profiles."} <Link href="/account">Account groups and access mode</Link></p>
    {group.mode === "account" && management ? <GroupManagementPanel key={management.contextKey} initial={management}/> : <ProfilePanel key={group.groupId} initial={view} action={profileAction.bind(null,group.pickerOwnerKey)} />}
  </div>;
}
