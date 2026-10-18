export const accountCookieName = "watchnext_account_session";
export function accountCredential(header: string | null) {
  const matches = (header ?? "").split(";").map(part => part.trim()).filter(part => part.startsWith(accountCookieName + "="));
  return matches.length === 1 ? matches[0].slice(accountCookieName.length + 1) : undefined;
}
