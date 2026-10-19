/** Published provider paths only; do not synthesize or fetch image URLs. */
export function kinopoiskPoster(value:unknown):string|null{
  if(typeof value!=="string"||/[\p{Cc}\s\\]/u.test(value))return null;
  try{const url=new URL(value),authority=value.match(/^https:\/\/([^/?#]+)/i)?.[1];
    if(!authority||url.protocol!=="https:"||url.username||url.password||url.port||url.hash||url.search)return null;
    const original=value.slice(value.indexOf(authority)+authority.length).split(/[?#]/,1)[0]||"/";if(original!==url.pathname)return null;
    const safe=url.hostname==="kinopoiskapiunofficial.tech"?/^\/images\/posters\/kp(?:_small)?\/[1-9]\d{0,7}\.(?:jpg|jpeg|png|webp)$/.test(url.pathname):url.hostname==="avatars.mds.yandex.net"&&/^\/get-kinopoisk-image\/[1-9]\d{0,12}\/[A-Za-z0-9-]{8,100}\/(?:orig|\d{1,4}x(?:\d{1,4})?)$/.test(url.pathname);
    return safe?url.href:null;
  }catch{return null;}
}
