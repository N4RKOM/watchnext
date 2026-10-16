import Link from "next/link";
import { getDatabase } from "../../../../db/server";
import { getGroupRequest } from "../../../../lib/access";
import { readEditableTitle } from "../../../../lib/edit-title";
import { AccessError } from "../../../../lib/sessions";
import { EditForm } from "./edit-form";
import { editTitleAction } from "./actions";
import { DetailError } from "../detail-error";
export const dynamic = "force-dynamic";
export default async function EditTitlePage({ params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params, initial = readEditableTitle(getDatabase(), await getGroupRequest(), id);
    return <div className="page-content"><div className="page-heading"><h1>Edit title</h1><p>Any selected contributor can edit this shared metadata. Names are trust-based profiles, not verified identities.</p></div><section className="placeholder"><EditForm key={initial.revision} initial={initial} action={editTitleAction.bind(null, id)} /></section></div>;
  } catch (error) { return error instanceof AccessError ? <div className="page-content"><h1>Editing unavailable</h1><p>Select a current contributor profile to edit an active title.</p><Link className="button" href="/watchlist">Back to watchlist</Link></div> : <DetailError />; }
}
