import { getDatabase } from "../../db/server";
import { getGroupRequest, getActionContext } from "../../lib/access";
import { AccessError } from "../../lib/sessions";
import { readPickerPage } from "../../lib/picker/server-only";
import { AccessErrorMessage } from "../components/access-error";
import { Picker } from "./picker";
import { pickAction } from "./actions";
import { PickerLoadError } from "./load-error";
export const dynamic = "force-dynamic";
export default async function PickPage() {
  try { const contextKey=await getActionContext("picker"); const view = readPickerPage(getDatabase(), await getGroupRequest()); return <Picker key={contextKey} view={view} action={pickAction.bind(null,contextKey)} />; }
  catch (error) { return error instanceof AccessError ? <AccessErrorMessage /> : <PickerLoadError />; }
}
