export type ContributionState = { kind: "idle" } | { kind: "success" | "error"; message: string };
export type ContributionAction = (previous: ContributionState, form: FormData) => Promise<ContributionState>;
