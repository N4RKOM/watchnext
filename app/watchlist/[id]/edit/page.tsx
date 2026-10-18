import Link from "next/link";
import { getDatabase } from "../../../../db/server";
import { getGroupRequest, getActionContext } from "../../../../lib/access";
import { readEditableTitle } from "../../../../lib/edit-title";
import { AccessError } from "../../../../lib/sessions";
import { EditForm } from "./edit-form";
import { editTitleAction } from "./actions";
import { DetailError } from "../detail-error";
export const dynamic = "force-dynamic";
export default async function EditTitlePage({ params }: { params: Promise<{ id: string }> }) {
  try {
    const contextKey=await getActionContext(); const { id } = await params, initial = readEditableTitle(getDatabase(), await getGroupRequest(), id);
    return <div className="page-content"><div className="page-heading"><h1>Edit title</h1><p>Contributors can edit this metadata. Changes are shared with your group.</p></div><section className="placeholder"><EditForm key={initial.revision} initial={initial} action={editTitleAction.bind(null, contextKey, id)} /></section></div>;
  } catch (error) { return error instanceof AccessError ? <div className="page-content"><h1>Editing unavailable</h1><p>Select a current contributor profile to edit an active title.</p><Link className="button" href="/watchlist">Back to watchlist</Link></div> : <DetailError />; }
}
