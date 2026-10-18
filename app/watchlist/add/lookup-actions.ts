"use server";
import { getDatabase } from "../../../db/server";
import { getGroupRequest } from "../../../lib/access";
import { configuredMetadataProviders } from "../../../lib/metadata/providers";
import { beginReview, selectReviewCandidate, type ReviewResult } from "../../../lib/metadata/reviews";
import { lookupFailure } from "../../../lib/metadata/lookup";

export async function lookupTitleAction(contextKey: string | undefined, form: FormData): Promise<ReviewResult> {
  try { return await beginReview(getDatabase(), await getGroupRequest(true, contextKey), form.get("source"), form.get("query"), configuredMetadataProviders(), process.env.WATCHNEXT_APP_ORIGIN); }
  catch { return lookupFailure("provider_error"); }
}
export async function selectCandidateAction(contextKey: string | undefined, form: FormData): Promise<ReviewResult> {
  try { return await selectReviewCandidate(getDatabase(), await getGroupRequest(true, contextKey), form.get("handle"), form.get("candidateId"), configuredMetadataProviders(), process.env.WATCHNEXT_APP_ORIGIN); }
  catch { return lookupFailure("invalid_query"); }
}
