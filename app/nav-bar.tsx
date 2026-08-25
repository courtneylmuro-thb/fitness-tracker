"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/log", label: "Log Food" },
  { href: "/workout", label: "Log Workout" },
  { href: "/scan", label: "Body Scan" },
  { href: "/backgrounds", label: "Backgrounds" },
];

export default function NavBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        className={`menu-btn ${open ? "open" : ""}`}
        aria-label="Menu"
        onClick={() => setOpen((o) => !o)}
      >
        <span />
        <span />
        <span />
      </button>
      {open && <div className="menu-overlay" onClick={() => setOpen(false)} />}
      <nav className={`menu-panel ${open ? "open" : ""}`}>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={pathname === l.href ? "active" : ""}>
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
