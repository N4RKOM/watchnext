import type { MetadataValues } from "../title-state";
import type { MetadataItem } from "./types";
export function reviewValues(item: MetadataItem): MetadataValues {
  const seconds = item.duration.seconds;
  return { title: item.title ?? "", contentType: item.contentType ?? "", minutes: seconds === null ? "" : String(Math.floor(seconds / 60)), seconds: seconds === null ? "" : String(seconds % 60), numberingStyle: "", genres: item.genres.join(", "), watchUrl: item.watchUrl ?? "", sourceUrl: item.sourceUrl ?? "", coverUrl: item.coverUrl ?? "" };
}
