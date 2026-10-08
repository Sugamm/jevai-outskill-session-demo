import { existsSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { Caladea, Carlito } from "next/font/google";
import Nav from "@/components/Nav";
import "./globals.css";

const caladea = Caladea({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-serif" });
const carlito = Carlito({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = { title: "Jev vs LLM · Outskill" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const hasLogo = existsSync(path.join(process.cwd(), "public/logo.png"));
  return (
    <html lang="en" className={`${caladea.variable} ${carlito.variable}`}>
      <body>
        <header className="topbar">
          <Nav />
          {hasLogo ? <img className="logo" src="/logo.png" alt="Outskill" /> : <span className="logo-text">Outskill</span>}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
