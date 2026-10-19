"use client";
import {useEffect,useRef,type ReactNode} from "react";
/** Native private-view navigation avoids restoring a previous group's client router snapshot. */
export function WatchlistReadBoundary({children}:{children:ReactNode}){
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const hide=()=>{if(root.current)root.current.hidden=true;};
  const restore=(event:PageTransitionEvent)=>{if(event.persisted){hide();window.location.reload();}};
  const history=(event:PopStateEvent)=>{event.stopImmediatePropagation();hide();window.location.reload();};
  const navigate=(event:MouseEvent)=>{
   if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
   const target=event.target instanceof Element?event.target.closest("a[href]"):null;
   if(!(target instanceof HTMLAnchorElement)||target.target||target.hasAttribute("download"))return;
   const url=new URL(target.href);if(url.origin!==location.origin||(url.pathname===location.pathname&&url.search===location.search&&url.hash))return;
   event.preventDefault();event.stopImmediatePropagation();hide();window.location.assign(url.href);
  };
  window.addEventListener("click",navigate,true);window.addEventListener("popstate",history,true);window.addEventListener("pagehide",hide);window.addEventListener("pageshow",restore);
  return()=>{window.removeEventListener("click",navigate,true);window.removeEventListener("popstate",history,true);window.removeEventListener("pagehide",hide);window.removeEventListener("pageshow",restore);};
 },[]);
 return <div ref={root}>{children}</div>;
}
