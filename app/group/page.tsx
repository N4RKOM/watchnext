import { getActiveGroup } from "../../lib/access";
import { AccessErrorMessage } from "../components/access-error";

export const dynamic = "force-dynamic";

export default async function GroupPage() {
  let group;
  try { group = await getActiveGroup(); } catch { return <AccessErrorMessage />; }
  return <div className="page-content">
    <div className="page-heading"><p className="eyebrow">You’re in good company</p><h1 className="saved-group-name">{group.groupName}</h1><p className="page-introduction">Welcome to your group.</p></div>
    <section className="placeholder" aria-labelledby="profile-heading">
      <span className="status-label">Profiles coming next</span><h2 id="profile-heading">Who’s watching?</h2>
      <p>Anyone with the invitation can access this group and select a name or profile. Selecting a name does not verify personal identity.</p>
      <p>Profile creation and selection aren’t available yet. Your group is ready for the next step.</p>
    </section>
  </div>;
}
