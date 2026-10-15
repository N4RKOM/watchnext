import { getActiveGroup, getGroupRequest } from "../../lib/access";
import { getDatabase } from "../../db/server";
import { getProfileView } from "../../lib/profiles";
import { AccessErrorMessage } from "../components/access-error";
import { ProfilePanel } from "./profile-panel";
import { profileAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function GroupPage() {
  let group;
  let view;
  try { group = await getActiveGroup(); view = getProfileView(getDatabase(), await getGroupRequest()); } catch { return <AccessErrorMessage />; }
  return <div className="page-content">
    <div className="page-heading"><p className="eyebrow">You’re in good company</p><h1 className="saved-group-name">{group.groupName}</h1><p className="page-introduction">Welcome to your group.</p></div>
    <ProfilePanel key={group.groupId} initial={view} action={profileAction} />
  </div>;
}
