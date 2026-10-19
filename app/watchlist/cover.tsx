"use client";
import { useEffect, useRef, useState } from "react";
import { youtubeThumbnail } from "../../lib/metadata/youtube-thumbnail";
import { kinopoiskPoster } from "../../lib/metadata/kinopoisk-poster";

export function safeCoverUrl(value: string | null) { return youtubeThumbnail(value) ?? kinopoiskPoster(value); }
export function Cover({ url, title, video = false }: { url: string | null; title: string | null; video?: boolean }) {
  const safe = safeCoverUrl(url);
  // Key the inner view so a new URL clears both event and cached-load failure state.
  return <CoverImage key={safe ?? "missing"} safe={safe} title={title} video={video || Boolean(youtubeThumbnail(safe))} />;
}
function CoverImage({safe,title,video}:{safe:string|null;title:string|null;video:boolean}) {
  const [failed,setFailed]=useState(false),image=useRef<HTMLImageElement>(null);
  useEffect(()=>{if(image.current?.complete && image.current.naturalWidth===0)setFailed(true);},[safe]);
  return <div className={`title-cover${video ? " video-cover" : ""}`}>
    {safe && !failed ? <img ref={image} src={safe} alt={`${title ?? "Metadata unavailable"} cover`} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)} /> : <span className="cover-fallback"><span aria-hidden="true">▤</span>No cover</span>}
  </div>;
}
