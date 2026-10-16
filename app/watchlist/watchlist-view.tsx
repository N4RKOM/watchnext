import Link from "next/link";
import type { WatchlistView } from "../../lib/watchlist";
import { contentTypes, durationLabel } from "../../lib/title-state";
import { initials } from "../../lib/profile-state";
import { Cover } from "./cover";

export function WatchlistContent({ view }: { view: WatchlistView }) {
  const selected = Boolean(view.activeMemberId);
  return <div className="page-content"><div className="page-heading"><h1>Your watchlist</h1><p className="page-introduction">All the things your group has been meaning to watch.</p>
    {selected ? <Link className="button" href="/watchlist/add">Add title</Link> : <><p>Choose a profile before adding a title.</p><Link className="button" href="/group">Choose profile</Link></>}
  </div>
  {view.items.length === 0 ? <section className="placeholder"><h2>Your watchlist is empty</h2><p>Add the first thing your group wants to watch.</p></section> : <ul className="watchlist-items">
    {view.items.map((item) => <li key={item.id}><article className="watchlist-card" aria-labelledby={`title-${item.id}`}>
      <Cover key={`${item.id}:${item.coverUrl}`} url={item.coverUrl} title={item.title} />
      <div className="watchlist-metadata"><h2 id={`title-${item.id}`}>{item.title}</h2><p>{contentTypes.find((type) => type.value === item.contentType)?.label}</p>
        <p>{item.numberingStyle === "none" ? "Full duration" : "Typical episode duration"}: {durationLabel(item.durationSeconds)}</p>
        <p>Moods: {item.moods.join(", ") || "Not specified"}</p>
        <p className="field-label">Added by</p><ul className="contributor-list">{item.contributors.map((member) => <li key={member.id}><span className="avatar" style={{ backgroundColor: member.color }} aria-hidden="true">{initials(member.name)}</span><span className="profile-name">{member.name}</span></li>)}</ul>
        <Link href={`/watchlist/${encodeURIComponent(item.id)}`} aria-label={`View details: ${item.title}`}>View details</Link>
      </div>
    </article></li>)}
  </ul>}
  </div>;
}
