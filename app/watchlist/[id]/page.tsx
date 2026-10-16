import Link from "next/link";
import { getDatabase } from "../../../db/server";
import { getGroupRequest } from "../../../lib/access";
import { readTitleDetails } from "../../../lib/title-details";
import { authorizeRequest } from "../../../lib/request-access";
import { AccessError } from "../../../lib/sessions";
import { AccessErrorMessage } from "../../components/access-error";
import { DetailView } from "./detail-view";
import { DetailError } from "./detail-error";
import { contributionAction } from "../contribution-actions";
import { refreshMetadataAction } from "../refresh-actions";
import { episodeProgressAction } from "../episode-actions";
import { watchProgressAction } from "../watch-actions";
export const dynamic = "force-dynamic";
export default async function TitleDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ contribution?: string }> }) {
  try { const { id } = await params, detail=readTitleDetails(getDatabase(), await getGroupRequest(), id);return <DetailView detail={detail} watchAction={watchProgressAction.bind(null, id)} episodeAction={episodeProgressAction.bind(null, id)} contributionAction={contributionAction.bind(null, id)} contributionSaved={(await searchParams).contribution === "saved"} refreshAction={detail.providerNamespace === "youtube" || detail.providerNamespace === "kinopoisk_unofficial" ? refreshMetadataAction.bind(null, id) : undefined} />; }
  catch (error) {
    if (!(error instanceof AccessError)) return <DetailError />;
    try { authorizeRequest(getDatabase(), await getGroupRequest()); } catch { return <AccessErrorMessage />; }
    return <div className="page-content"><h1>Title unavailable</h1><p>This title isn’t available in your group.</p><Link className="button" href="/watchlist">Back to watchlist</Link></div>;
  }
}
