"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  ["/race", "Race"],
  ["/confidence", "Confidence"],
  ["/stress", "Break it"],
  ["/calibration", "Calibration"],
  ["/dataset", "Dataset"],
  ["/health", "Health"],
] as const;

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>
        Home
      </Link>
      {NAV.map(([href, label]) => (
        <Link key={href} href={href} aria-current={pathname.startsWith(href) ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
