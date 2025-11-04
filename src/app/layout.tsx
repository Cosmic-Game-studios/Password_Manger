import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vaultlight Password Manager",
  description:
    "Client-side password manager with breach checks, strong generator, and future-ready security features.",
};

const navigationLinks = [
  { href: "/", label: "Vault" },
  { href: "/launch", label: "Launch" },
  { href: "/settings", label: "Settings" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="app-header">
            <Link href="/" className="app-header__brand">
              Vaultlight
            </Link>
            <nav className="app-header__nav">
              {navigationLinks.map((link) => (
                <Link key={link.href} href={link.href} className="app-header__link">
                  {link.label}
                </Link>
              ))}
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
