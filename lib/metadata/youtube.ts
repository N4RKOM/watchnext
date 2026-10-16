import "server-only";
import { youtubeProvider } from "./youtube-transport";

/** Server configuration only. Never import this entry from a Client Component. */
export function configuredYoutubeProvider() {
  return youtubeProvider({ apiKey: process.env.YOUTUBE_API_KEY });
}
