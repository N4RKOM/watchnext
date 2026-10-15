"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const destinations = [
  { href: "/", label: "Group entry" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/pick", label: "Pick for me" },
  { href: "/archive", label: "Archive" },
];

export function Navigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation">
      <ul className="navigation">
        {destinations.map(({ href, label }) => {
          const active = pathname === href || (href === "/" && pathname === "/group") || (href !== "/" && pathname.startsWith(href + "/"));
          return (
            <li key={href}>
              <Link className="navigation-link" href={href} aria-current={active ? "page" : undefined}>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
