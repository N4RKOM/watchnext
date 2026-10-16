import "server-only";
import { kinopoiskUnofficialProvider } from "./kinopoisk-transport";

/** Third-party Unofficial API configuration, not official Kinopoisk access. */
export function configuredKinopoiskUnofficialProvider() {
  return kinopoiskUnofficialProvider({ apiKey: process.env.KINOPOISK_UNOFFICIAL_API_KEY });
}
