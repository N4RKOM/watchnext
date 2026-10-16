export type OwnRating = { memberId: string; score: number | null };
export type RatingState = { kind: "idle" | "saved" | "invalid" | "error"; rating?: OwnRating; error?: string; message?: string };
export type RatingAction = (previous: RatingState, form: FormData) => Promise<RatingState>;
