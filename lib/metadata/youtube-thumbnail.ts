/** Only a provider-supplied thumbnail, never a synthesized video-ID URL. */
export function youtubeThumbnail(value: unknown): string | null {
  if(typeof value!=="string"||/[\p{Cc}\s\\]/u.test(value))return null;
  try{const url=new URL(value);
    if(url.protocol!=="https:"||url.hostname!=="i.ytimg.com"||url.port||url.username||url.password||url.hash)return null;
    if([...url.searchParams.keys()].some(key=>/key|token|secret|auth|credential|password|signature/i.test(key)))return null;
    return url.href;
  }catch{return null;}
}
