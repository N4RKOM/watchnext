export type ContextIdentity = Readonly<{ mode: "mock"; instance: string; revision: number }>;
export type FieldErrors = Readonly<Partial<Record<"mode" | "scenario" | "context" | "username" | "password" | "confirmation" | "proof", string>>>;
export type ServiceFailure = Readonly<{
  kind: "failure";
  error: Readonly<{
    code: "invalid_selection" | "demo_unavailable" | "invalid_account" | "invalid_credentials" | "invalid_proof" | "group_access" | "group_input" | "invite_invalid";
    message: string;
    retryable: boolean;
    fields?: FieldErrors;
  }>;
}>;
export type ServiceResult<T> =
  | Readonly<{ kind: "success"; value: T; context: ContextIdentity }>
  | ServiceFailure
  | Readonly<{ kind: "stale"; message: string }>
  | Readonly<{ kind: "cancelled"; message: string }>;
export type MockScenario = "ready" | "slow" | "unavailable";
export type RequestOptions = Readonly<{ signal?: AbortSignal; scenario?: MockScenario }>;
export type MockContext = Readonly<{
  identity: ContextIdentity;
  label: "Synthetic workspace";
  account: AccountSummary | null;
  group: GroupSummary | null;
}>;
export interface ContextService {
  readonly initialIdentity: ContextIdentity;
  read(options?: RequestOptions): Promise<ServiceResult<MockContext>>;
  reset(expected: ContextIdentity, options?: Pick<RequestOptions, "signal">): Promise<ServiceResult<MockContext>>;
}
export interface FrontendService {
  readonly mode: "mock";
  readonly context: ContextService;
  readonly accounts: AccountService;
  readonly groups: GroupService;
  // Domain namespaces will be added by #55–#60, never fabricated as successful here.
}

export const avatarColors = ["blue", "purple", "teal", "rose", "amber", "slate"] as const;
export type AvatarColor = typeof avatarColors[number];
export type GroupSummary = Readonly<{ id: string; name: string; kind: "account" | "legacy"; generation: number }>;
export type MemberSummary = Readonly<{ id: string; accountId: string | null; name: string; color: AvatarColor; owner: boolean; you: boolean; active: boolean; generation: number; removedAtGeneration: number | null; references: Readonly<{ contributions: readonly string[]; history: readonly string[] }> }>;
export type GroupWorkspace = Readonly<{
  mode: "account" | "legacy";
  memberships: readonly GroupSummary[];
  selected: GroupSummary | null;
  members: readonly MemberSummary[];
  profileId: string | null;
  canManage: boolean;
  pending: Readonly<{ needsAccount: boolean; groupName: string | null }> | null;
}>;
export type InviteDisclosure = Readonly<{ invite: string; kind: "account" | "legacy" }>;
export interface GroupService {
  read(options?: RequestOptions): Promise<ServiceResult<GroupWorkspace>>;
  create(name: string, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<InviteDisclosure>>;
  select(id: string, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<GroupWorkspace>>;
  resolve(invite: string, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<GroupWorkspace>>;
  join(expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<GroupWorkspace>>;
  mode(mode: "account" | "legacy", expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<GroupWorkspace>>;
  remove(memberId: string, memberGeneration: number, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<GroupWorkspace>>;
  rotate(generation: number, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<InviteDisclosure>>;
  createLegacy(name: string, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<InviteDisclosure>>;
  createProfile(name: string, color: AvatarColor, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<GroupWorkspace>>;
  selectProfile(id: string, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<GroupWorkspace>>;
}
export type DemoSelection = Readonly<{ mode: "mock"; scenario: MockScenario }>;
export type SelectionResult = Readonly<{ kind: "success"; value: DemoSelection }> | ServiceFailure;
export function selectDemo(mode: unknown, scenario: unknown): SelectionResult {
  const fields: Partial<Record<"mode" | "scenario", string>> = {};
  if (mode !== undefined && mode !== "mock") fields.mode = "Only the isolated mock preview is available at this entry.";
  if (scenario !== undefined && scenario !== "ready" && scenario !== "slow" && scenario !== "unavailable") fields.scenario = "Choose Ready, Slow or Unavailable.";
  if (Object.keys(fields).length) return { kind: "failure", error: { code: "invalid_selection", message: "Unsupported preview selection. Open the default mock preview and try again.", retryable: false, fields } };
  return { kind: "success", value: { mode: "mock", scenario: scenario === undefined ? "ready" : scenario as MockScenario } };
}
export function sameContext(a: ContextIdentity, b: ContextIdentity): boolean {
  return a.mode === b.mode && a.instance === b.instance && a.revision === b.revision;
}

export type AccountSummary = Readonly<{ id: string; username: string; seeded: boolean; memberships: readonly string[] }>;
export type AccountInput = Readonly<{ username: string; password: string; confirmation?: string; proof?: string }>;
export type PrivateDisclosure = Readonly<{ code: string; next: "account" | "signin" }>;
export interface AccountService {
  read(options?: RequestOptions): Promise<ServiceResult<MockContext>>;
  register(input: AccountInput, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<PrivateDisclosure>>;
  signIn(input: AccountInput, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<MockContext>>;
  signOut(expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<MockContext>>;
  recover(input: AccountInput, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<PrivateDisclosure>>;
}
