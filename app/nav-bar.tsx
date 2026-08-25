"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/log", label: "Log Food" },
  { href: "/scan", label: "Body Scan" },
  { href: "/backgrounds", label: "Backgrounds" },
];

export default function NavBar() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={pathname === l.href ? "active" : ""}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
