// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
const { pickFromForm, getDatabase, getGroupRequest } = vi.hoisted(() => ({ pickFromForm: vi.fn(), getDatabase: vi.fn(), getGroupRequest: vi.fn() }));
vi.mock("../../db/server", () => ({ getDatabase }));
vi.mock("../../lib/access", () => ({ getGroupRequest }));
vi.mock("../../lib/picker/server-only", () => ({ pickFromForm }));
import { pickAction } from "../../app/pick/actions";
import { AccessError } from "../../lib/sessions";
afterEach(() => vi.resetAllMocks());
const form = () => { const data = new FormData(); data.set("requestId", "request"); data.set("groupId", "group"); return data; };
it("action forwards the actual mutation request and returns only guarded response", async () => {
  const db = {}, request = new Request("https://watch.example"); getDatabase.mockReturnValue(db); getGroupRequest.mockResolvedValue(request);
  const expected = { kind: "no_match", groupId: "group", requestId: "request", reasons: [], links: [], message: "No saved titles" }; pickFromForm.mockReturnValue(expected);
  const data = form(); expect(await pickAction(undefined, data)).toEqual(expected); expect(getGroupRequest).toHaveBeenCalledWith(true); expect(pickFromForm).toHaveBeenCalledWith(db, request, data, process.env.WATCHNEXT_APP_ORIGIN);
});
it("storage and access failures produce safe retry/context identifiers, not raw errors", async () => {
  for (const error of [new Error("PRIVATE SQL C:/private secret"), new AccessError()]) {
    pickFromForm.mockImplementation(() => { throw error; }); const result = await pickAction(undefined, form());
    expect(result).toMatchObject({ kind: "error", groupId: "group", requestId: "request", message: expect.stringContaining("inputs are still here") }); expect(JSON.stringify(result)).not.toMatch(/PRIVATE|SQL|secret|C:\//);
  }
});
