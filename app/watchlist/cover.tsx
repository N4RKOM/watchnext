"use client";
import { useEffect, useRef, useState } from "react";

export function safeCoverUrl(value: string | null) {
  if (!value || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && /^https?:\/\//i.test(value) ? url.href : null; } catch { return null; }
}
export function Cover({ url, title }: { url: string | null; title: string }) {
  const [failed, setFailed] = useState(false), safe = safeCoverUrl(url);
  const image = useRef<HTMLImageElement>(null);
  // A cached failure may finish before hydration attaches the error handler.
  useEffect(() => { if (image.current?.complete && image.current.naturalWidth === 0) setFailed(true); }, [safe]);
  return <div className="title-cover">
    {safe && !failed ? <img ref={image} src={safe} alt={`${title} cover`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span className="cover-fallback"><span aria-hidden="true">▤</span>No cover</span>}
  </div>;
}
