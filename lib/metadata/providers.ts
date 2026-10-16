import "server-only";
import { configuredYoutubeProvider } from "./youtube";
import { configuredKinopoiskUnofficialProvider } from "./kinopoisk";
export function configuredMetadataProviders() {
  return { youtube: configuredYoutubeProvider(), kinopoisk_unofficial: configuredKinopoiskUnofficialProvider() };
}
