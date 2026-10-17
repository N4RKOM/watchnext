import { getDatabase } from "../../db/server";
import { getGroupRequest } from "../../lib/access";
import { AccessError } from "../../lib/sessions";
import { readPickerPage } from "../../lib/picker/server-only";
import { AccessErrorMessage } from "../components/access-error";
import { Picker } from "./picker";
import { pickAction } from "./actions";
import { PickerLoadError } from "./load-error";
export const dynamic = "force-dynamic";
export default async function PickPage() {
  try { const view = readPickerPage(getDatabase(), await getGroupRequest()); return <Picker key={view.groupId} view={view} action={pickAction} />; }
  catch (error) { return error instanceof AccessError ? <AccessErrorMessage /> : <PickerLoadError />; }
}
