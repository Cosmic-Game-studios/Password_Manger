import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vaultlight Password Manager",
  description:
    "Lokaler Passwort-Manager mit Breach-Checks und starkem Generator.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
