import Link from "next/link";
import { getDatabase } from "../../../db/server";
import { getGroupRequest } from "../../../lib/access";
import { readTitleDetails } from "../../../lib/title-details";
import { authorizeRequest } from "../../../lib/request-access";
import { AccessError } from "../../../lib/sessions";
import { AccessErrorMessage } from "../../components/access-error";
import { DetailView } from "./detail-view";
import { DetailError } from "./detail-error";
export const dynamic = "force-dynamic";
export default async function TitleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  try { return <DetailView detail={readTitleDetails(getDatabase(), await getGroupRequest(), (await params).id)} />; }
  catch (error) {
    if (!(error instanceof AccessError)) return <DetailError />;
    try { authorizeRequest(getDatabase(), await getGroupRequest()); } catch { return <AccessErrorMessage />; }
    return <div className="page-content"><h1>Title unavailable</h1><p>This title isn’t available in your group.</p><Link className="button" href="/watchlist">Back to watchlist</Link></div>;
  }
}
